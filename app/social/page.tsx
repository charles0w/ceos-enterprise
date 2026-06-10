import type { Metadata } from 'next';
import { SocialStudio } from '@/components/social/SocialStudio';

export const metadata: Metadata = {
  title: 'Social Studio · CEO OS',
  description: 'AI short-form video editor — drop content, prompt the cut, render in-browser',
};

export default function SocialPage() {
  return <SocialStudio />;
}
