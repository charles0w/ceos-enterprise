export interface Agent {
  id: string;
  name: string;
  role: string;
  ownerRepo: string;
  skills: string[];
  schedule: string;
}

export interface AgentStatus {
  state: 'ok' | 'warn' | 'error';
  lastRun: string;
  summary: string;
  ok: boolean;
}

export interface AgentWithStatus {
  agent: Agent;
  status: AgentStatus | null;
}
