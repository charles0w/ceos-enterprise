import type { Agent } from './types';

export const AGENTS: Agent[] = [
  {
    id: 'commerce',
    name: 'Commerce',
    role: 'Dropshipping + card flips',
    ownerRepo: 'shopify-arbitrage + card-arbitrage',
    skills: ['sourcing', 'listing-gen', 'fulfillment'],
    schedule: 'hourly fulfillment loop',
    mode: 'scheduled', cadenceMinutes: 60, graceMinutes: 30,
  },
  {
    id: 'finance',
    name: 'Finance',
    role: 'Portfolios, EOD recaps, investment research',
    ownerRepo: 'ai-trading-bot',
    skills: ['markets', 'research', 'reporting'],
    schedule: 'EOD recap 4pm PT',
    mode: 'scheduled', cadenceMinutes: 1440, graceMinutes: 240,
  },
  {
    id: 'lambos-trader',
    name: 'Lambos Trader',
    role: 'Discord-alert options copy-trading (paper)',
    ownerRepo: 'lambos-trader',
    skills: ['discord-ingest', 'ocr-parse', 'risk-sizing', 'paper-exec'],
    schedule: 'daily paper + evals → live Aug 20',
    mode: 'scheduled', cadenceMinutes: 1440, graceMinutes: 360,
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
    schedule: 'daily 9am PT',
    mode: 'scheduled', cadenceMinutes: 1440, graceMinutes: 240,
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
    schedule: 'daily deadline scan 8am PT',
    mode: 'scheduled', cadenceMinutes: 1440, graceMinutes: 240,
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
