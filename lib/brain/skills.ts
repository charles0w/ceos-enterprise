export type SkillDomain = 'finance' | 'social' | 'client-ops' | 'garage' | 'internal';

export const SKILL_DOMAINS: SkillDomain[] = ['finance', 'social', 'client-ops', 'garage', 'internal'];

export interface Skill {
  id: number;
  name: string;           // kebab-case slug, unique key
  title: string;          // human-readable display name
  trigger: string;        // natural-language condition: "when X happens, apply this skill"
  knowledge: string;      // what the agent should know/do (markdown ok)
  domain: SkillDomain;
  escalate: boolean;      // true = must surface to Charles before acting
  confidence: number;     // 0–1, how battle-tested is this rule
  source: string;         // 'manual' | 'vault://...' | 'inferred'
  usage_count: number;    // how many times an agent has cited this skill
  status: 'active' | 'proposed' | 'retired';
  last_fired: string | null;
  outcomes: { good: number; bad: number };
  evidence: string[];
  created_at: string;
  updated_at: string;
}

export type SkillInsert =
  Omit<Skill, 'id' | 'usage_count' | 'created_at' | 'updated_at' | 'status' | 'last_fired' | 'outcomes' | 'evidence'>
  & Partial<Pick<Skill, 'status' | 'last_fired' | 'outcomes' | 'evidence'>>;

// Simple keyword relevance — ranks skills against a free-text query without a vector DB.
export function rankSkills(skills: Skill[], query: string): Skill[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return skills;
  return skills
    .map((s) => {
      const hay = `${s.name} ${s.title} ${s.trigger} ${s.knowledge} ${s.domain}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { s, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ s }) => s);
}

// The 10 seed skills for CEO OS Phase 1.
// These codify how Charles's company operates so agents can act consistently.
export const SEED_SKILLS: SkillInsert[] = [
  {
    name: 'client-pricing-exception',
    title: 'Client Pricing Exception',
    trigger: 'Client pushes back on price or asks for a discount or refund',
    knowledge: `Charles approves all exceptions above $200. Below $200: hold firm using — "Our pricing reflects the full-service delivery we guarantee. I want to make sure you get the outcomes, not cut corners on execution."

No discounts during launch month (first 30 days of engagement). After month 1, a goodwill credit (not a discount — never discount) may be offered if results are measurably below plan. Document every exception request with date, client name, amount, and outcome.`,
    domain: 'client-ops',
    escalate: false,
    confidence: 0.9,
    source: 'manual',
  },
  {
    name: 'new-business-launch-gate',
    title: 'New Business Launch Gate',
    trigger: 'Agent is about to launch a new client website, GMB listing, or online presence',
    knowledge: `Block launch until all three gates pass:
1. Google Business Profile — claimed AND verified (not just created). Phone number matches website.
2. Photos — minimum 3 uploaded: storefront, interior, product/service shot.
3. NAP consistency — Name, Address, Phone identical across GBP, website, and any citations.

If any gate is missing: surface the specific gap to Charles with a numbered checklist. Do not launch partial — a bad first impression hurts local SEO ranking permanently. Document what passed and what failed.`,
    domain: 'client-ops',
    escalate: false,
    confidence: 0.95,
    source: 'manual',
  },
  {
    name: 'escalate-to-charles',
    title: 'Escalation Decision Rule',
    trigger: 'Agent is deciding whether to act independently or surface to Charles',
    knowledge: `Escalate immediately if ANY of these are true:
- Action involves money movement, pricing change, or contract term
- Client explicitly threatens to leave or references a competitor
- Message contains legal language (dispute, lawsuit, refund demand, chargeback)
- Task is more than 2 days past its deadline and client hasn't been updated
- Action is irreversible (permanent deletion, account cancellation, publishing something public)
- Situation is genuinely novel — agent has no matching skill or precedent

Otherwise: decide, act, and report the outcome in the next scheduled update. Do not ask permission for reversible, low-stakes decisions. Bias toward action.`,
    domain: 'internal',
    escalate: true,
    confidence: 0.95,
    source: 'manual',
  },
  {
    name: 'social-post-approval',
    title: 'Social Post Approval Flow',
    trigger: 'Content is ready to schedule or publish on any social platform',
    knowledge: `@ceo.0uch (Charles personal brand): Charles approves EVERY post before it goes live. Stage in draft and notify Charles via CEO agent with the full post text + platform + planned publish time.

Client accounts: Agent may publish if the content matches the pre-approved brief (topic, angle, CTA). If content deviates from the approved brief — different hook, different topic, different claim — stage it and escalate.

Never publish content that:
- Mentions a specific competitor by name
- Makes earnings/income/results claims without a documented case study
- Uses testimonials not verified by Charles
- Tags or mentions someone who hasn't consented`,
    domain: 'social',
    escalate: true,
    confidence: 0.9,
    source: 'manual',
  },
  {
    name: 'trade-entry-rule',
    title: 'Trade Entry Rule (Lambos Trader)',
    trigger: 'Lambos-trader agent is evaluating whether to enter a position',
    knowledge: `Phase: PAPER TRADING ONLY until 2026-08-20. No real capital deployed before that date, regardless of signal quality or conviction level.

Entry checklist — ALL required before entering any position:
1. Written thesis in ≤2 sentences stating the specific edge (not "it looks bullish")
2. Risk/reward ratio ≥ 2:1, defined before entry (not post-hoc rationalization)
3. Position size ≤ 5% of paper capital per trade
4. No more than 3 open positions simultaneously
5. No entry in the 30 minutes before or after a major macro event (FOMC, CPI, NFP)

Log every entry to the daily eval report with: thesis, entry price, target, stop, timeframe.`,
    domain: 'finance',
    escalate: false,
    confidence: 0.95,
    source: 'manual',
  },
  {
    name: 'profit-recognition',
    title: 'Profit Recognition Rule',
    trigger: 'Agent wants to log realized profit or update The Garage ledger',
    knowledge: `Only counts as realized profit when:
- Client invoice: PAID and settled in bank or Stripe — not sent, not promised, not pending
- Trade: CLOSED and exited — not open, not unrealized P&L
- Commerce sale: margin confirmed (revenue minus COGS/fees) — not gross revenue

Never log:
- Projections, estimates, or expected income
- Paper-trading results (lambos-trader is on paper trial until 2026-08-20)
- Growth closed_amount (counted automatically from businesses table — double-counting is a hard error)
- Affiliate commissions before the network confirms payment

When in doubt: ask Charles to confirm the amount before recording.`,
    domain: 'garage',
    escalate: true,
    confidence: 1.0,
    source: 'manual',
  },
  {
    name: 'report-cadence',
    title: 'Agent Report Cadence',
    trigger: 'Agent is deciding when and how to send a status report',
    knowledge: `Daily agents (social, finance, growth): report by 8am PT with yesterday's outcomes.

Event-triggered: report within 1 hour of the trigger (trade close, client issue, task completion, anomaly detected).

Report format — 3 lines max:
1. Status: [done / in progress / blocked] — one sentence, name the deliverable
2. Metric: exactly one number that moved (views, revenue, leads, score, etc.)
3. Next: what happens next OR what you need from Charles to unblock

No metric = no report. If nothing moved, say "no change — monitoring [X]." Never send a blank or vague status. Reports without metrics are deleted from the queue.`,
    domain: 'internal',
    escalate: false,
    confidence: 0.9,
    source: 'manual',
  },
  {
    name: 'client-churn-signal',
    title: 'Client Churn Early Warning',
    trigger: 'Client goes quiet, misses a call, sends a negative signal, or engagement drops',
    knowledge: `Flag to Charles after 7 calendar days of zero client response across all channels (email, text, call).

Draft a re-engagement message — DO NOT send without Charles approval:
"Hey [name], just checking in — wanted to make sure we're aligned on [current deliverable/milestone]. Can we grab 15 min this week to sync?"

Churn escalation triggers (escalate immediately, do not negotiate):
- Client explicitly says they want to pause, cancel, or "think about it"
- Client mentions a competitor by name
- Client disputes a charge or invoice
- Sentiment in 3+ consecutive messages turns negative

Never offer a discount or service extension as a retention tool — Charles negotiates retention directly.`,
    domain: 'client-ops',
    escalate: true,
    confidence: 0.85,
    source: 'manual',
  },
  {
    name: 'task-delegation-depth',
    title: 'Task Delegation Depth Limit',
    trigger: 'Agent considers delegating a sub-task to another agent or tool',
    knowledge: `Maximum one level of delegation. An agent may delegate research, data-gathering, or content generation to another agent or tool. An agent may NOT delegate:
- Client-facing actions or communications
- Financial decisions or payment-related operations
- Anything that requires Charles's sign-off

All sub-tasks must be visible in fleet_tasks (the CEO fleet dashboard queue). An agent that sub-delegates remains fully responsible for the parent task outcome — "I delegated it" is not an acceptable final status.

If a task genuinely requires more than one level of delegation, escalate to Charles to re-delegate from the top with proper ownership assigned.`,
    domain: 'internal',
    escalate: false,
    confidence: 0.9,
    source: 'manual',
  },
  {
    name: 'vault-sync-trigger',
    title: 'When to Write to the Vault',
    trigger: 'Agent or CEO is deciding whether to call append_memory or write a note',
    knowledge: `Write to the vault when ANY of these are true:
- A new pricing or business decision is confirmed by Charles
- A new operational precedent is set (first time something is handled a new way)
- A trade thesis is validated or invalidated with a clear, documented outcome
- Charles explicitly says "remember this," "add this to the brain," or "log that"
- A new client is onboarded (basic profile: name, business, service, start date)
- A new skill or rule is established (it should also go into Company Brain)

Do NOT write to vault for:
- Transient task status updates ("task #12 done")
- Daily market observations without a clear decision attached
- Content that was already written to vault this session (check first with recall_memory)
- Anything Charles hasn't confirmed as durable`,
    domain: 'internal',
    escalate: false,
    confidence: 0.9,
    source: 'manual',
  },
];
