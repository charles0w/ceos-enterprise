import { getFleet } from '@/lib/registry';
import { getGrowthStats } from '@/lib/growth';
import { getJobStats } from '@/lib/jobs';
import { FleetDashboard } from '@/components/FleetDashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [fleet, growthStats, jobStats] = await Promise.all([
    getFleet(),
    getGrowthStats(),
    getJobStats(),
  ]);
  return <FleetDashboard initial={fleet} growthStats={growthStats} jobStats={jobStats} />;
}
