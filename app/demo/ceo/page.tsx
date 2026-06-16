import { DemoCeoChat } from '@/components/DemoCeoChat';

export const dynamic = 'force-static';

export const metadata = {
  title: 'CEO OS — Ask the CEO (Demo)',
  description: 'Scripted public demo of the CEO orchestrator chat.',
};

// Public, auth-free scripted version of the /ceo orchestrator. No API, no DB.
export default function DemoCeoPage() {
  return <DemoCeoChat />;
}
