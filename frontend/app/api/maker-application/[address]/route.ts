import { NextRequest, NextResponse } from 'next/server';
import { backendUrlFromRequest } from '@/lib/server/backendTarget';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const backendUrl = backendUrlFromRequest(req);
  const { address } = await params;
  try {
    const res = await fetch(`${backendUrl}/api/makers/application/${address}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}
