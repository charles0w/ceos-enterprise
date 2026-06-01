import { getFleet } from '@/lib/registry';
import { Fleet } from '@/components/Fleet';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const fleet = await getFleet();
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>CEO&apos;s Enterprise</h1>
      <p style={{ color: '#888', marginTop: 0 }}>Agent fleet control plane</p>
      <Fleet initial={fleet} />
    </main>
  );
}
