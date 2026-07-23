import { FleetDashboard } from '@/components/FleetDashboard';
import {
  demoFleet, demoGrowthStats, demoJobStats, demoGarage, demoTasks, demoEvents,
} from '@/lib/demoData';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'CEO OS — Live Demo',
  description: 'Public read-only demo of the CEO OS agent fleet control plane (mock data).',
  openGraph: {
    title: 'CEO OS — Agent Fleet Control Plane',
    description: 'Six agents working while you sleep. Live demo with mock data.',
    type: 'website',
  },
  twitter: { card: 'summary' },
};

// Public, auth-free showcase of the real dashboard UI driven by fictional
// data. Whitelisted in middleware.ts; touches no DB and no API.
export default function DemoPage() {
  return (
    <FleetDashboard
      demo
      initial={demoFleet()}
      growthStats={demoGrowthStats()}
      jobStats={demoJobStats()}
      garage={demoGarage()}
      initialTasks={demoTasks()}
      initialEvents={demoEvents()}
    />
  );
}
