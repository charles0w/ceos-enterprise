import { CeoChat } from '@/components/CeoChat';

export const dynamic = 'force-dynamic';

// The CEO orchestrator chat surface. Behind the fleet_session gate (middleware).
export default function CeoPage() {
  return <CeoChat />;
}
