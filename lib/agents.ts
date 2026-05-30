import type { Agent } from './types';

export const AGENTS: Agent[] = [
  {
    id: 'commerce',
    name: 'Commerce',
    role: 'Dropshipping + card flips',
    ownerRepo: 'shopify-arbitrage + card-arbitrage',
    skills: ['sourcing', 'listing-gen', 'fulfillment'],
    schedule: 'hourly fulfillment loop',
  },
  {
    id: 'finance',
    name: 'Finance',
    role: 'Portfolios, EOD recaps, investment research',
    ownerRepo: 'ai-trading-bot',
    skills: ['markets', 'research', 'reporting'],
    schedule: 'EOD recap 4pm PT',
  },
  {
    id: 'growth',
    name: 'Growth',
    role: 'Lead-gen and cold outreach',
    ownerRepo: 'berkeley-biz-websites',
    skills: ['scraping', 'site-gen', 'cold-email'],
    schedule: 'daily outreach batch',
  },
  {
    id: 'social',
    name: 'Social',
    role: 'Manages social accounts, posting, trend scouting',
    ownerRepo: 'instagram-trend-desk',
    skills: ['content', 'scheduling', 'trend-analysis'],
    schedule: 'daily 9am PT',
  },
  {
    id: 'hobbies',
    name: 'Hobbies',
    role: 'Open slot',
    ownerRepo: '(new — Phase 4)',
    skills: [],
    schedule: '—',
  },
  {
    id: 'school',
    name: 'School / Tutor',
    role: 'Coursework, deadlines, tutoring (vault-aware)',
    ownerRepo: '(new — Phase 4)',
    skills: ['calendar', 'study', 'vault'],
    schedule: '—',
  },
];
