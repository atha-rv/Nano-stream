import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const actions = new Set(['state', 'preview', 'thumbnail', 'connect', 'start', 'stop', 'disconnect', 'folder', 'storage', 'gallery', 'gallery_refresh', 'download', 'cancel']);

async function proxy(request: NextRequest, context: {params: Promise<{action: string}>}) {
  const {action} = await context.params;
  if (!actions.has(action)) return NextResponse.json({error: 'Not found'}, {status: 404});
  const host = request.headers.get('host');
  const port = process.env.NANO_UI_PORT || '3020';
  if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(host || '')) {
    return NextResponse.json({error: 'This camera tool is available only on this PC.'}, {status: 403});
  }
  const origin = request.headers.get('origin');
  if (request.method === 'POST' && origin && origin !== `http://${host}`) {
    return NextResponse.json({error: 'Untrusted request origin.'}, {status: 403});
  }
  const mutation = ['connect', 'start', 'stop', 'disconnect', 'folder', 'gallery_refresh', 'download', 'cancel'].includes(action);
  if (action !== 'storage' && (request.method === 'POST') !== mutation) return NextResponse.json({error: 'Method not allowed'}, {status: 405});
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && Buffer.byteLength(body) > (action === 'download' ? 512000 : 4096)) return NextResponse.json({error: 'Request is too large'}, {status: 413});
  try {
    const file = process.env.NANO_BRIDGE_SESSION || resolve(process.cwd(), '../../../.research/nano-bridge-session.json');
    const session = JSON.parse(await readFile(file, 'utf8')) as {port: number; token: string};
    if (session.port !== 8765 || typeof session.token !== 'string') throw new Error('Invalid bridge session');
    const query = action === 'thumbnail' ? request.nextUrl.search : '';
    const upstream = await fetch(`http://127.0.0.1:8765/${action}${query}`, {
      method: request.method,
      headers: {'X-Nano-Token': session.token, 'Content-Type': 'application/json'},
      body: body || undefined,
      cache: 'no-store',
      signal: action === 'preview' ? request.signal : AbortSignal.timeout(15000),
    });
    return new Response(upstream.body, {status: upstream.status, headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }});
  } catch {
    return NextResponse.json({error: 'The local camera bridge is offline. Start Nano Monitor from its launcher.'}, {status: 503});
  }
}

export const GET = proxy;
export const POST = proxy;
