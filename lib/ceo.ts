import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { getFleet } from './registry';
import { ensureTasksTable } from './fleetTasks';
import { searchMemory, getMemory, listMemory, upsertMemory } from './aiMemory';

// The "CEO" — head orchestrator of Charles's AI fleet. Runs on Opus 4.8 with a
// small tool surface: recall/read/append the shared AI-memory graph, inspect the
// fleet, and delegate tasks to fleet agents. The vault (obi-secondbrain/ai-memory)
// is the human-facing graph; this reads/writes the synced Postgres mirror so it
// works from the deployed dashboard. Auth is handled upstream by middleware.

const MODEL = 'claude-opus-4-8';
const MAX_TURNS = 6; // bound the agentic loop to stay within the function time budget

export interface CeoTrace {
  tool: string;
  input: unknown;
  resultPreview: string;
}

export interface CeoResult {
  reply: string;
  trace: CeoTrace[];
}

const SYSTEM = `You are the CEO — the head orchestrator of Charles's autonomous AI fleet, "CEO OS" (the ceos-enterprise dashboard). Charles is a technical UC Berkeley student running a fleet of AI agents, each owning a repo and a domain (Commerce, Finance, Lambos Trader, Growth, Jobs, Social, plus open School/Hobbies slots).

Your job: be Charles's chief of staff. Understand what he wants, pull the right context from the shared AI-memory knowledge graph, give clear direction, and delegate concrete tasks to the right fleet agents. Manage the memory graph — when you learn a durable fact, decision, or preference, append it so the fleet shares it.

Operating principles:
- Ground answers in the memory graph and live fleet status — call tools rather than guessing. Use recall_memory first when a question touches Charles, strategy, an agent, or a tool/platform.
- Be direct and concise. Give a recommendation, not a survey.
- Truthful tailoring, human-in-the-loop for irreversible actions, low-ToS-risk — honor Charles's operating principles (read them via recall_memory if unsure).
- When you delegate, write a crisp task spec the owning agent can act on, and tell Charles what you delegated.
- Only append_memory for genuinely durable, reusable knowledge (a decision, a stable preference, a new fact about the fleet) — not for transient chatter.
- Current Claude models: Opus 4.8, Sonnet 4.6, Haiku 4.5. Never reference retired model names.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'recall_memory',
    description:
      "Keyword-search the shared AI-memory graph (Charles's profile, strategy, fleet agents, entities, learnings). Returns short previews. Use this first when a question touches who Charles is, strategy/goals, a specific agent, or a tool/platform.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keywords to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'read_memory',
    description: 'Read the full body of one memory note by its slug (from a recall_memory result).',
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'The note slug, e.g. fleet/jobs-agent' } },
      required: ['slug'],
    },
  },
  {
    name: 'list_memory',
    description: 'List memory notes, optionally filtered by kind (core | fleet | entity | learning).',
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', description: 'Optional kind filter' } },
      required: [],
    },
  },
  {
    name: 'list_fleet',
    description:
      'Get the live fleet: every agent (id, name, role, owner repo, schedule) with its latest reported status and summary. Use to see what each agent is and its current state before delegating.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'delegate_task',
    description:
      'Assign a concrete task to a fleet agent. Records it in the fleet_tasks queue (the owning repo/agent picks it up). Use a clear, actionable task spec.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Fleet agent id, e.g. jobs, commerce, finance, growth, social, lambos-trader' },
        title: { type: 'string', description: 'Short task title' },
        spec: { type: 'string', description: 'Actionable task description with the context the agent needs' },
      },
      required: ['agentId', 'title', 'spec'],
    },
  },
  {
    name: 'append_memory',
    description:
      "Add or update a durable memory note in the shared graph (a decision, stable preference, or new fact). It syncs back into Charles's vault. Only for reusable knowledge, not transient chatter.",
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: "Stable id, e.g. learning/prefers-typescript" },
        title: { type: 'string' },
        body: { type: 'string', description: 'Markdown body. May include [[wikilinks]] to other notes.' },
      },
      required: ['slug', 'title', 'body'],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'recall_memory': {
      const notes = await searchMemory(String(input.query ?? ''), 6);
      if (!notes.length) return 'No matching memory notes.';
      return notes
        .map((n) => `[${n.slug}] ${n.title} (${n.kind})\n${n.body.slice(0, 280)}`)
        .join('\n\n');
    }
    case 'read_memory': {
      const note = await getMemory(String(input.slug ?? ''));
      return note ? `# ${note.title}\n\n${note.body}` : `No note with slug ${input.slug}.`;
    }
    case 'list_memory': {
      const notes = await listMemory(input.kind ? String(input.kind) : undefined);
      return notes.length
        ? notes.map((n) => `- [${n.slug}] ${n.title} (${n.kind})`).join('\n')
        : 'No memory notes found.';
    }
    case 'list_fleet': {
      const fleet = await getFleet();
      return fleet
        .map((f) => {
          const s = f.status;
          const state = s ? `${s.state} — ${s.summary}` : 'no status reported';
          return `- ${f.agent.id} (${f.agent.name}) · ${f.agent.role} · repo ${f.agent.ownerRepo} · ${state}`;
        })
        .join('\n');
    }
    case 'delegate_task': {
      await ensureTasksTable();
      const { rows } = await sql`
        INSERT INTO fleet_tasks (agent_id, title, spec)
        VALUES (${String(input.agentId)}, ${String(input.title)}, ${String(input.spec)})
        RETURNING id
      `;
      return `Delegated to '${input.agentId}' as task #${rows[0]?.id}: ${input.title}`;
    }
    case 'append_memory': {
      await upsertMemory({
        slug: String(input.slug),
        title: String(input.title),
        body: String(input.body),
        kind: 'learning',
        source: 'ceo',
      });
      return `Saved memory note '${input.slug}'.`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

export async function runCeo(messages: Anthropic.MessageParam[]): Promise<CeoResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  }
  const client = new Anthropic();
  const trace: CeoTrace[] = [];
  const convo: Anthropic.MessageParam[] = [...messages];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: SYSTEM,
      tools: TOOLS,
      messages: convo,
    });

    // Preserve the full assistant turn (incl. thinking + tool_use blocks).
    convo.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: reply || '(no text reply)', trace };
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let out: string;
      try {
        out = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
      } catch (err) {
        out = `Tool error: ${String(err)}`;
      }
      trace.push({ tool: tu.name, input: tu.input, resultPreview: out.slice(0, 200) });
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    convo.push({ role: 'user', content: toolResults });
  }

  return {
    reply: "I've gathered context but hit the tool-iteration limit before finishing. Ask me to continue.",
    trace,
  };
}
