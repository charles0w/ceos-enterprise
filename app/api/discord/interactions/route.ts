import { NextRequest, NextResponse } from 'next/server';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { AGENTS } from '@/lib/agents';
import { getFleet } from '@/lib/registry';
import { enqueueTask } from '@/lib/fleetTasks';
import { logEvent } from '@/lib/events';

// Discord Interactions endpoint — the two-way half of the #notifs channel.
// Slash commands let a Discord reply become direction for the fleet:
//   /fleet                       → live status snapshot
//   /run    agent:<id>           → queue a run-request (same path as the dashboard Run button)
//   /direct agent:<id> instruction:<text> → queue a CEO task with your instruction as the spec
//
// Auth is Discord's ed25519 request signature (DISCORD_PUBLIC_KEY), verified on
// the raw body per their spec — no session, no report secret. Register the
// commands once with scripts/discord-register-commands.mjs; setup steps in RUNBOOKS.md.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Raw ed25519 public key (hex) → SPKI DER so node:crypto can consume it.
function publicKey() {
  const hex = process.env.DISCORD_PUBLIC_KEY;
  if (!hex) return null;
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function verifySignature(req: NextRequest, rawBody: string): boolean {
  const key = publicKey();
  const sig = req.headers.get('x-signature-ed25519');
  const ts = req.headers.get('x-signature-timestamp');
  if (!key || !sig || !ts) return false;
  try {
    return edVerify(null, Buffer.from(ts + rawBody), key, Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

const reply = (content: string) =>
  NextResponse.json({ type: 4, data: { content: content.slice(0, 1900) } });

function ageLabel(lastRun: string | null | undefined): string {
  if (!lastRun) return 'never ran';
  const mins = Math.round((Date.now() - Date.parse(lastRun)) / 60000);
  if (!Number.isFinite(mins)) return 'unknown';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${(mins / 60).toFixed(1)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

async function fleetSnapshot(): Promise<string> {
  const fleet = await getFleet();
  const lines = fleet.map(({ agent, status }) => {
    const emoji = !status ? '⚪' : status.state === 'ok' ? '🟢' : status.state === 'warn' ? '🟡' : '🔴';
    const summary = status?.summary ? ` — ${String(status.summary).slice(0, 80)}` : '';
    return `${emoji} **${agent.name}** · ${ageLabel(status?.lastRun)}${summary}`;
  });
  return `**Fleet status**\n${lines.join('\n')}`;
}

type Option = { name: string; value?: string };

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: 'invalid request signature' }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // PING — Discord's endpoint validation handshake.
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  if (interaction.type !== 2) return reply('Unsupported interaction type.');

  const command: string = interaction.data?.name ?? '';
  const options: Option[] = interaction.data?.options ?? [];
  const opt = (name: string) => options.find((o) => o.name === name)?.value?.toString() ?? '';
  const user = interaction.member?.user?.username ?? interaction.user?.username ?? 'discord';

  try {
    if (command === 'fleet') {
      return reply(await fleetSnapshot());
    }

    if (command === 'run' || command === 'direct') {
      const agentId = opt('agent');
      const agent = AGENTS.find((a) => a.id === agentId);
      if (!agent) return reply(`Unknown agent \`${agentId}\`. Valid: ${AGENTS.map((a) => a.id).join(', ')}`);

      const instruction = command === 'direct' ? opt('instruction').slice(0, 500) : 'on-demand run requested';
      if (command === 'direct' && !instruction) return reply('Give me an instruction, e.g. `/direct agent:commerce instruction:research 5 new products`.');

      const task = await enqueueTask(agentId, {
        title: command === 'direct' ? instruction.slice(0, 80) : 'Run requested',
        spec: instruction,
        createdBy: `discord:${user}`,
        dedupe: command === 'run',
      });
      await logEvent(agentId, 'info', `${command === 'direct' ? 'direction' : 'run request'} from Discord (${user}) → task #${task.id}`);
      return reply(
        command === 'direct'
          ? `📨 Queued for **${agent.name}** (task #${task.id}): “${instruction}” — it picks this up on its next wake.`
          : `▶️ Run requested for **${agent.name}** (task #${task.id}) — queued until its next wake/poll.`,
      );
    }

    return reply(`Unknown command \`/${command}\`.`);
  } catch (e) {
    return reply(`⚠️ Command failed: ${String((e as Error).message).slice(0, 200)}`);
  }
}
