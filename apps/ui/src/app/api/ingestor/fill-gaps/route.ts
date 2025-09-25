import { NextRequest, NextResponse } from 'next/server';
import { ingestor } from '@hyperlocal/ingestor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try{
    const body = await req.json().catch(()=> ({}));
    const sinceDays = Number(body?.sinceDays ?? '');
    const sinceMs = Number.isFinite(sinceDays) && sinceDays > 0 ? Date.now() - sinceDays * 86_400_000 : undefined;
    const r = await ingestor.fillGapsNow(sinceMs);
    return NextResponse.json({ ok: true, result: r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

