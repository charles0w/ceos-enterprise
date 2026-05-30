import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "CEO's Enterprise",
  description: 'Agent fleet control plane',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
