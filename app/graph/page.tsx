import { MemoryGraph } from '@/components/MemoryGraph';

export const dynamic = 'force-dynamic';

// On-site Obsidian-style force-directed view of the AI-memory graph.
// Behind the fleet_session gate (middleware).
export default function GraphPage() {
  return <MemoryGraph />;
}
