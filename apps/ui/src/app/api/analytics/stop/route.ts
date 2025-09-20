import { NextResponse } from 'next/server';
import { featureEngine } from '@hyperlocal/analytics';
export async function POST(){ featureEngine.stop(); return NextResponse.json({ok:true}); }

