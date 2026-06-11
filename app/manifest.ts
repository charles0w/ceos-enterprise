import type { MetadataRoute } from 'next';

// Home-screen install metadata — the hub gets opened from a phone for the
// publish-from-phone flow, so it should behave like an app there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CEO OS',
    short_name: 'CEO OS',
    description: 'Agent fleet control plane',
    start_url: '/',
    display: 'standalone',
    background_color: '#030304',
    theme_color: '#030304',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
