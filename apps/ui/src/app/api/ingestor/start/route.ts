import { NextResponse } from 'next/server';
import { ingestor } from '@hyperlocal/ingestor';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await ingestor.start();
    return NextResponse.json({ ok: true, status: ingestor.getStatus() });
  } catch (e: any) {
    // Avoid failing the overall dev start; surface error in payload
    return NextResponse.json({ ok: false, error: String(e?.message ?? e), status: ingestor.getStatus?.() }, { status: 200 });
  }
}
