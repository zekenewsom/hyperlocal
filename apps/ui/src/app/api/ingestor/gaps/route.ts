import { NextRequest, NextResponse } from 'next/server';
import { findHyperliquidGaps } from '@hyperlocal/storage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sinceDays = Number(url.searchParams.get('sinceDays') ?? '');
  const sinceMs = Number.isFinite(sinceDays) && sinceDays > 0 ? Date.now() - sinceDays * 86_400_000 : undefined;
  const gaps = await findHyperliquidGaps(sinceMs);
  return NextResponse.json({ gaps });
}

