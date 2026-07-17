# Two-way Discord for the fleet

The #notifs webhook is one-way (app → Discord). The interactions endpoint at
`/api/discord/interactions` adds the other direction: slash commands in Discord
become queued work for the fleet.

## Commands

| Command | What it does |
|---|---|
| `/fleet` | Live snapshot — per-agent freshness + last summary (reads `getFleet()`) |
| `/run agent:<id>` | Queues a run-request (`fleet_tasks`), same as the dashboard Run button |
| `/direct agent:<id> instruction:<text>` | Queues a CEO task with your instruction as the spec — the agent picks it up on its next wake via `reporter/fleet_tasks.py` |

Every 🔴 DEGRADED page now ends with a reminder of these, so an alert is
answerable in place.

## One-time setup

1. **Create the Discord app** at <https://discord.com/developers/applications>
   ("New Application" → name it e.g. `CEO's Enterprise`). From **General
   Information** copy the **Application ID** and **Public Key**; from **Bot**
   copy the **Token**.
2. **Vercel env** (Production): set `DISCORD_PUBLIC_KEY` = the public key.
   Redeploy so the route can verify signatures.
3. **Point Discord at the endpoint**: General Information → *Interactions
   Endpoint URL* → `https://ceos-enterprise.vercel.app/api/discord/interactions`.
   Discord sends a signed PING on save — it only saves if the deployed route
   verifies + answers it.
4. **Register the commands** (local, one-off): add `DISCORD_APP_ID`,
   `DISCORD_BOT_TOKEN`, and (for instant availability) `DISCORD_GUILD_ID`
   (your server ID, right-click server → Copy Server ID) to `.env.local`, then

   ```sh
   node --env-file=.env.local scripts/discord-register-commands.mjs
   ```

5. **Add the app to your server**:
   `https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=applications.commands`

## Notes

- Auth is Discord's ed25519 request signature verified on the raw body — no
  bot gateway process, no session cookie, works on Vercel serverless.
- `middleware.ts` whitelists `/api/discord` (the route itself rejects unsigned
  requests with 401).
- Re-run the registration script whenever commands or the agent list change
  (`AGENT_CHOICES` in `scripts/discord-register-commands.mjs` mirrors
  `lib/agents.ts`).
