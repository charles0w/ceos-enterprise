import { getFleet } from '@/lib/registry';
import { getGrowthStats } from '@/lib/growth';
import { getJobStats } from '@/lib/jobs';
import { getGarage } from '@/lib/garage';
import { getRecentTasks } from '@/lib/fleetTasks';
import { FleetDashboard } from '@/components/FleetDashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [fleet, growthStats, jobStats, garage, tasks] = await Promise.all([
    getFleet(),
    getGrowthStats(),
    getJobStats(),
    getGarage(),
    getRecentTasks({ limit: 12 }),
  ]);
  return (
    <FleetDashboard
      initial={fleet}
      growthStats={growthStats}
      jobStats={jobStats}
      garage={garage}
      initialTasks={tasks}
    />
  );
}
