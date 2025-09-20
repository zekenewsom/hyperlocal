import { NextResponse } from 'next/server';
import { ingestor } from '@hyperlocal/ingestor';

export const dynamic = 'force-dynamic';

export async function POST() {
  await ingestor.start();
  return NextResponse.json({ ok: true, status: ingestor.getStatus() });
}

