import { NextRequest, NextResponse } from 'next/server';
import { backendUrlFromRequest } from '@/lib/server/backendTarget';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const backendUrl = backendUrlFromRequest(req);
  try {
    const body = await req.json();
    const res = await fetch(`${backendUrl}/api/makers/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
