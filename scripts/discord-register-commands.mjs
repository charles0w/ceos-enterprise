#!/usr/bin/env node
// One-off: register the fleet slash commands with Discord. Re-run whenever the
// command set or the agent list changes (overwrites are idempotent).
//
//   node --env-file=.env.local scripts/discord-register-commands.mjs
//
// Env: DISCORD_APP_ID + DISCORD_BOT_TOKEN (required).
//      DISCORD_GUILD_ID (optional) — register guild-scoped for instant availability;
//      omit for global commands (can take up to ~1h to propagate).

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
if (!APP_ID || !TOKEN) {
  console.error('DISCORD_APP_ID and DISCORD_BOT_TOKEN are required');
  process.exit(2);
}

// Keep in sync with lib/agents.ts (script is .mjs, can't import the TS module).
const AGENT_CHOICES = [
  'commerce', 'finance', 'lambos-trader', 'growth', 'jobs', 'social', 'hobbies', 'school',
].map((id) => ({ name: id, value: id }));

const agentOption = {
  type: 3, // STRING
  name: 'agent',
  description: 'Which fleet agent',
  required: true,
  choices: AGENT_CHOICES,
};

const commands = [
  {
    name: 'fleet',
    description: 'Live fleet status snapshot (per-agent freshness + last summary)',
    type: 1,
  },
  {
    name: 'run',
    description: 'Queue a run-request for an agent (picked up on its next wake)',
    type: 1,
    options: [agentOption],
  },
  {
    name: 'direct',
    description: 'Send an agent a direction — queued as a CEO task with your instruction',
    type: 1,
    options: [
      agentOption,
      {
        type: 3,
        name: 'instruction',
        description: 'What the agent should do (becomes the task spec)',
        required: true,
      },
    ],
  },
];

const url = GUILD
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const res = await fetch(url, {
  method: 'PUT', // bulk overwrite — replaces the full command set atomically
  headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
});

const body = await res.json();
if (!res.ok) {
  console.error(`Registration failed (${res.status}):`, JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`Registered ${body.length} command(s) ${GUILD ? `in guild ${GUILD}` : 'globally'}:`, body.map((c) => `/${c.name}`).join(' '));
