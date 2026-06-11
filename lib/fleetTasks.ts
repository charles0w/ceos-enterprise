import { sql } from '@vercel/postgres';

// ── fleet_tasks — the CEO's delegation queue ──────────────────
// Rows are written by the CEO's delegate_task tool (lib/ceo.ts). Agents
// read their queue and report progress through /api/tasks (x-report-secret),
// and the dashboard renders the same rows in the Delegations panel.

export type TaskStatus = 'queued' | 'in_progress' | 'done' | 'dropped';
export const TASK_STATUSES: TaskStatus[] = ['queued', 'in_progress', 'done', 'dropped'];

export interface FleetTask {
  id: number;
  agentId: string;
  title: string;
  spec: string;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
}

export async function ensureTasksTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS fleet_tasks (
      id          BIGSERIAL PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      spec        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'queued',
      created_by  TEXT NOT NULL DEFAULT 'ceo',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

interface TaskRow {
  id: string | number;
  agent_id: string;
  title: string;
  spec: string;
  status: string;
  created_by: string;
  created_at: string;
}

function toTask(r: TaskRow): FleetTask {
  return {
    id: Number(r.id),
    agentId: r.agent_id,
    title: r.title,
    spec: r.spec,
    status: (TASK_STATUSES.includes(r.status as TaskStatus) ? r.status : 'queued') as TaskStatus,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export async function getRecentTasks(opts?: { agentId?: string; status?: TaskStatus; limit?: number }): Promise<FleetTask[]> {
  const limit = Math.min(opts?.limit ?? 20, 100);
  try {
    await ensureTasksTable();
    const { rows } = opts?.agentId && opts?.status
      ? await sql<TaskRow>`SELECT * FROM fleet_tasks WHERE agent_id = ${opts.agentId} AND status = ${opts.status} ORDER BY created_at DESC LIMIT ${limit}`
      : opts?.agentId
        ? await sql<TaskRow>`SELECT * FROM fleet_tasks WHERE agent_id = ${opts.agentId} ORDER BY created_at DESC LIMIT ${limit}`
        : opts?.status
          ? await sql<TaskRow>`SELECT * FROM fleet_tasks WHERE status = ${opts.status} ORDER BY created_at DESC LIMIT ${limit}`
          : await sql<TaskRow>`SELECT * FROM fleet_tasks ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map(toTask);
  } catch {
    return []; // table unreachable — panel just shows its empty state
  }
}

export async function updateTaskStatus(id: number, status: TaskStatus): Promise<boolean> {
  await ensureTasksTable();
  const { rowCount } = await sql`UPDATE fleet_tasks SET status = ${status} WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}
