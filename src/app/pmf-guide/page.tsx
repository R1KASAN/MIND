import type { Metadata } from 'next';
import { PMFGuide } from '@/components/PMFGuide/PMFGuide';

export const metadata: Metadata = {
  title: 'MIND | PMF Template Pack',
  description: 'Interactive PMF guide สำหรับเช็ก pain point, urgency, frequency, retention, repeat usage และ conversion ของ MIND',
};

export default function PMFGuidePage() {
  return <PMFGuide />;
}
