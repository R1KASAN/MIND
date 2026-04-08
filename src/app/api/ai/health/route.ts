import { NextResponse } from 'next/server';
import { getAiHealth } from '@/lib/ai/ollama-runtime';

// Dedicated health endpoint for the client polling path: /api/ai/health
export async function GET() {
  const health = await getAiHealth();
  return NextResponse.json(health);
}
