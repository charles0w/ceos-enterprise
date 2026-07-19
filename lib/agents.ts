import type { Agent } from './types';

export const AGENTS: Agent[] = [
  {
    id: 'commerce',
    name: 'Commerce',
    role: 'Dropshipping + card flips',
    ownerRepo: 'shopify-arbitrage + card-arbitrage',
    skills: ['sourcing', 'listing-gen', 'fulfillment'],
    schedule: 'hourly fulfillment loop',
    // Grace 180: GitHub's */15 schedule is best-effort — measured gaps hit
    // ~200 min nightly (6–9:30 PM PT). Tighten to ~60 once the Vercel
    // dispatch-commerce cron (needs GH_DISPATCH_TOKEN) proves a steady 15-min tick.
    mode: 'scheduled', cadenceMinutes: 60, graceMinutes: 180,
  },
  {
    id: 'finance',
    name: 'Finance',
    role: 'Portfolios, EOD recaps, investment research',
    ownerRepo: 'ai-trading-bot',
    skills: ['markets', 'research', 'reporting'],
    schedule: 'EOD recap 4pm PT (weekdays — markets closed Sat/Sun)',
    // Grace covers the weekend gap (Fri 4pm → Mon 4pm ≈ 4320m): without it,
    // finance goes "overdue" every Saturday and pages a phantom degrade/recover
    // pair. A genuine weekday failure still surfaces within ~a day.
    mode: 'scheduled', cadenceMinutes: 1440, graceMinutes: 4320,
  },
  {
    id: 'lambos-trader',
    name: 'Lambos Trader',
    role: 'Discord-alert options copy-trading (paper)',
    ownerRepo: 'lambos-trader',
    skills: ['discord-ingest', 'ocr-parse', 'risk-sizing', 'paper-exec'],
    schedule: 'paused — paper trial not started (flip to scheduled when it runs)',
    // On-demand while parked: health should flag broken expectations, not deliberate pauses.
    mode: 'on-demand',
  },
  {
    id: 'growth',
    name: 'Growth',
    role: 'Lead-gen and cold outreach',
    ownerRepo: 'berkeley-biz-websites',
    skills: ['scraping', 'site-gen', 'cold-email'],
    schedule: 'daily outreach batch',
    mode: 'scheduled', cadenceMinutes: 1440, graceMinutes: 360,
  },
  {
    id: 'jobs',
    name: 'Jobs',
    role: 'Internship/job scraping, tailoring, submission tracking',
    ownerRepo: 'ceos-jobs',
    skills: ['scraping', 'resume-tailoring', 'submission', 'tracking'],
    schedule: 'daily ingest + on-demand tailoring',
    mode: 'on-demand',
  },
  {
    id: 'social',
    name: 'Social',
    role: 'Manages social accounts, posting, trend scouting',
    ownerRepo: 'instagram-trend-desk',
    skills: ['content', 'scheduling', 'trend-analysis'],
    schedule: 'on-demand — brief loop idle since 6/21 (set weekly cadence 10080 when it restarts)',
    mode: 'on-demand',
  },
  {
    id: 'hobbies',
    name: 'Hobbies',
    role: 'Open slot',
    ownerRepo: '(new — Phase 4)',
    skills: [],
    schedule: '—',
    mode: 'on-demand',
  },
  {
    id: 'school',
    name: 'School / Tutor',
    role: 'Coursework, deadlines, tutoring (vault-aware)',
    ownerRepo: 'obi-secondbrain (vault: school/fall-2026)',
    skills: ['calendar', 'study', 'vault', 'tutoring'],
    schedule: 'summer break — flip to scheduled daily when Fall 2026 starts (~late Aug)',
    mode: 'on-demand',
  },
];

// Resolved runtime cadence for an agent, with safe defaults. Missing mode →
// 'on-demand' (never flagged overdue). Scheduled/continuous without an explicit
// cadence default to daily. Health + the runbook read this, not the raw fields.
export function agentRuntime(a: Agent): {
  mode: 'scheduled' | 'on-demand' | 'continuous';
  cadenceMinutes: number | null;
  graceMinutes: number;
} {
  const mode = a.mode ?? 'on-demand';
  const graceMinutes = a.graceMinutes ?? 60;
  const cadenceMinutes = mode === 'on-demand' ? null : a.cadenceMinutes ?? 1440;
  return { mode, cadenceMinutes, graceMinutes };
}
