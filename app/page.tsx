import { getFleet } from '@/lib/registry';
import { getGrowthStats } from '@/lib/growth';
import { CeoOS } from '@/components/CeoOS';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [fleet, growthStats] = await Promise.all([getFleet(), getGrowthStats()]);
  return <CeoOS initial={fleet} growthStats={growthStats} />;
}
