import { NextResponse } from 'next/server';
import { ingestor } from '@hyperlocal/ingestor';

export const dynamic = 'force-dynamic';

export async function POST() {
  await ingestor.stop();
  return NextResponse.json({ ok: true, status: ingestor.getStatus() });
}

