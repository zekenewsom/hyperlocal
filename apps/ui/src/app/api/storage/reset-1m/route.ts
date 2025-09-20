import { NextResponse } from 'next/server';
import { resetIntervalParquet, deleteFeaturesForInterval, createParquetViews } from '@hyperlocal/storage';
import { getDb } from '@hyperlocal/storage';
import { ingestor } from '@hyperlocal/ingestor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    await ingestor.stop();
  } catch {}
  // Remove 1m parquet files
  const { deletedFiles, deletedDirs } = resetIntervalParquet('1m');
  // Rebuild views
  const conn = getDb().connect();
  try {
    await createParquetViews(conn);
  } finally { conn.close(); }
  // Clear features for 1m
  await deleteFeaturesForInterval('1m');
  // Restart ingestor (triggers backfill + live)
  await ingestor.start();
  return NextResponse.json({ ok: true, deletedFiles, deletedDirs, restarted: true });
}

