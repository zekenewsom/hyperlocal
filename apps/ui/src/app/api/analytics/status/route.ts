import { NextResponse } from 'next/server';
import { featureEngine } from '@hyperlocal/analytics';
export async function GET(){ return NextResponse.json(featureEngine.status()); }

