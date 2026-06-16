// ── Demo data — fully fictional but realistic ─────────────────
// Powers the public /demo showcase (no auth, no DB). Numbers are invented
// and stable; agent ids match lib/agents.ts so the dashboard's sigils,
// sparklines, and per-agent config all render exactly like the real thing.
// Nothing here touches Postgres/KV or the Anthropic API.

import { AGENTS } from './agents';
import type { AgentWithStatus, AgentStatus } from './types';
import type { GrowthStats } from './growth';
import type { JobStats } from './jobs';
import type { GarageData, GarageTarget } from './garage';
import type { FleetTask } from './fleetTasks';
import type { EventFeed, FleetEvent } from './events';

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// Per-agent fictional status. Agents left out (hobbies, school) stay idle.
const STATUS: Record<string, AgentStatus> = {
  commerce: {
    state: 'ok', ok: true, lastRun: minsAgo(22),
    summary: '12 orders fulfilled overnight · 2 restocks queued',
    metrics: [
      { label: 'Revenue', value: 4820, money: true },
      { label: 'Orders', value: 63 },
      { label: 'Margin', value: 18, unit: '%', signed: true },
    ],
    progress: 0.42, evalScore: 0.86, evalReliability: 0.9,
    evalSummary: 'Listings on-brand; flagged 2 SKUs for price drift.',
  },
  finance: {
    state: 'ok', ok: true, lastRun: minsAgo(48),
    summary: 'EOD recap shipped · 3 theses updated',
    metrics: [
      { label: 'Watchlist', value: 14 },
      { label: 'Day P/L', value: 1.8, unit: '%', signed: true },
      { label: 'Hit rate', value: 64, unit: '%' },
    ],
    progress: 0.55, evalScore: 0.79, evalReliability: 0.82,
    evalSummary: 'Recap accurate; one source citation missing.',
  },
  'lambos-trader': {
    state: 'warn', ok: true, lastRun: minsAgo(95),
    summary: 'Paper run complete · 1 risk flag (size cap breached)',
    metrics: [
      { label: 'Paper P/L', value: 6.2, unit: '%', signed: true },
      { label: 'Trades', value: 9 },
      { label: 'Max DD', value: -3.1, unit: '%', signed: true },
    ],
    progress: 0.3, evalScore: 0.71, evalReliability: 0.68,
    evalSummary: 'Alert parsing solid; position sizing breached cap once.',
  },
  growth: {
    state: 'ok', ok: true, lastRun: minsAgo(11),
    summary: '318 scraped · 41 sites built · 196 emails sent · 12 replies · 3 closed',
    metrics: [
      { label: 'Leads', value: 318 },
      { label: 'Sites', value: 41 },
      { label: 'Emails', value: 196 },
    ],
    progress: 0.48, evalScore: 0.88, evalReliability: 0.91,
    evalSummary: 'Outreach copy personalized; deliverability healthy.',
  },
  jobs: {
    state: 'ok', ok: true, lastRun: minsAgo(70),
    summary: '74 found · 31 tailored · 22 applied · 4 interviews · 1 offer',
    metrics: [
      { label: 'Found', value: 74 },
      { label: 'Applied', value: 22 },
      { label: 'Interviews', value: 4 },
    ],
    progress: 0.36, evalScore: 0.8, evalReliability: 0.77,
    evalSummary: 'Resume tailoring matched JD keywords well.',
  },
  social: {
    state: 'ok', ok: true, lastRun: minsAgo(33),
    summary: '7 posts scheduled · 3 trends scouted',
    metrics: [
      { label: 'Reach', value: 12400 },
      { label: 'Saves', value: 410 },
      { label: 'Trend hits', value: 3 },
    ],
    progress: 0.6, evalScore: 0.74, evalReliability: 0.7,
    evalSummary: 'On-brand; one caption ran over length.',
  },
};

export function demoFleet(): AgentWithStatus[] {
  return AGENTS.map((agent) => ({ agent, status: STATUS[agent.id] ?? null }));
}

export function demoGrowthStats(): GrowthStats {
  return {
    total: 318, sitesBuilt: 41, withEmail: 240,
    outreachSent: 196, outreachReplied: 12, closed: 3,
    lastScrapedAt: minsAgo(11),
  };
}

export function demoJobStats(): JobStats {
  return {
    discovered: 74, tailored: 31, submitted: 22,
    interviews: 4, offers: 1, lastActivityAt: minsAgo(70),
  };
}

export function demoGarage(): GarageData {
  const fromGrowth = 4500;   // 3 closed website deals
  const fromLedger = 8200;   // realized profit posted by other agents
  const total = fromGrowth + fromLedger;
  const targets: Omit<GarageTarget, 'progress'>[] = [
    { id: '812', label: 'Ferrari 812 Superfast', sub: 'Rosso Corsa', price: 400_000 },
    { id: 'm4', label: 'BMW M4 Competition', sub: 'first key', price: 85_000, img: '/assets/m-logo.png' },
    { id: 'studio', label: 'Highrise studio', sub: 'floor 40+, skyline', price: 150_000 },
  ];
  return {
    total, fromGrowth, fromLedger,
    targets: targets.map((t) => ({ ...t, progress: Math.min(1, total / t.price) })),
  };
}

export function demoTasks(): FleetTask[] {
  return [
    { id: 1, agentId: 'growth', title: 'Re-run outreach on no-reply leads', spec: 'Second-touch the 40 leads with sites built but no reply in 5 days.', status: 'in_progress', createdBy: 'ceo', createdAt: minsAgo(40) },
    { id: 2, agentId: 'lambos-trader', title: 'Investigate size-cap breach', spec: 'One paper trade exceeded the per-position risk cap — find the cause.', status: 'in_progress', createdBy: 'ceo', createdAt: minsAgo(90) },
    { id: 3, agentId: 'social', title: 'Draft 3 posts from top trend', spec: 'Turn this week’s #1 scouted trend into 3 on-brand drafts.', status: 'queued', createdBy: 'ceo', createdAt: minsAgo(25) },
    { id: 4, agentId: 'commerce', title: 'Flag SKUs with >15% price drift', spec: 'Compare live prices to source cost; flag margin erosion.', status: 'queued', createdBy: 'ceo', createdAt: minsAgo(15) },
    { id: 5, agentId: 'finance', title: 'Summarize positions into EOD recap', spec: 'Generate the 4pm PT end-of-day recap with updated theses.', status: 'done', createdBy: 'ceo', createdAt: minsAgo(180) },
  ];
}

export function demoEvents(): EventFeed {
  const events: FleetEvent[] = [
    { agentId: 'growth', sev: 'ok', message: '3 new sites generated and queued for outreach', ts: minsAgo(11) },
    { agentId: 'commerce', sev: 'ok', message: '12 orders fulfilled · 2 SKUs flagged for price drift', ts: minsAgo(22) },
    { agentId: 'social', sev: 'info', message: '7 posts scheduled for the week', ts: minsAgo(33) },
    { agentId: 'finance', sev: 'ok', message: 'EOD recap generated · +1.8% day P/L', ts: minsAgo(48) },
    { agentId: 'jobs', sev: 'info', message: '1 offer received · interview scheduled for 2 more', ts: minsAgo(70) },
    { agentId: 'lambos-trader', sev: 'warn', message: 'Paper trade breached per-position size cap', ts: minsAgo(95) },
    { agentId: 'ceo', sev: 'info', message: 'Delegated follow-up outreach pass to Growth', ts: minsAgo(40) },
    { agentId: 'growth', sev: 'ok', message: 'Closed deal: $1,500 site build (local cafe)', ts: minsAgo(140) },
    { agentId: 'finance', sev: 'ok', message: 'Recorded realized profit: +$620', ts: minsAgo(160) },
    { agentId: 'ceo', sev: 'info', message: 'Sunday brief generated and posted to vault', ts: minsAgo(220) },
  ];
  // Seeded 24h activity (oldest → newest) so the throughput chart looks alive.
  const hourly = [0,1,0,2,1,0,1,3,2,1,0,2,1,1,0,2,3,1,2,4,2,1,3,2];
  return { events, count24: 31, hourly, profit24: 4500 };
}
