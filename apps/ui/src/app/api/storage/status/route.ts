import { NextResponse } from 'next/server';
import { storageStatus, ensureBaseDirs } from '@hyperlocal/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureBaseDirs();
  const st = await storageStatus();
  return NextResponse.json(st);
}
