import { NextResponse } from 'next/server';
import { initDuckDb, ensureBaseDirs } from '@hyperlocal/storage';

export const dynamic = 'force-dynamic';

export async function POST() {
  ensureBaseDirs();
  await initDuckDb();
  return NextResponse.json({ ok: true });
}
