import { NextResponse } from 'next/server';
import { ingestor } from '@hyperlocal/ingestor';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(ingestor.getStatus());
}

