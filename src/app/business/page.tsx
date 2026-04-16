import type { Metadata } from 'next';
import { MonetizationDashboard } from '@/components/Business/MonetizationDashboard';

export const metadata: Metadata = {
  title: 'MIND | Business Model Enforcement',
  description: 'Local analytics dashboard and monetization gate view for MIND outcome-first reset',
};

export default function BusinessPage() {
  return <MonetizationDashboard />;
}

