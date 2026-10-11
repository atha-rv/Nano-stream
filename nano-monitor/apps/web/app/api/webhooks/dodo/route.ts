import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getDodoClient, billingIsConfigured } from '~/lib/billing/server';
import { eventToRpc } from '~/lib/billing/core';
import type { FoundationDatabase } from '~/lib/foundation.types';

export async function POST(request: Request) {
  if (!billingIsConfigured())
    return Response.json({ error: 'Billing not configured' }, { status: 503 });
  const eventId = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!eventId || !timestamp || !signature)
    return Response.json({ error: 'Missing signature' }, { status: 401 });
  // Bound the raw body before parsing or verification, including chunked bodies.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Missing body' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      return Response.json({ error: 'Body too large' }, { status: 413 });
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let event;
  try {
    event = getDodoClient().webhooks.unwrap(new TextDecoder().decode(bytes), {
      headers: {
        'webhook-id': eventId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
    });
  } catch {
    return Response.json({ error: 'Invalid webhook' }, { status: 401 });
  }
  if (event.business_id !== process.env.DODO_PAYMENTS_BUSINESS_ID)
    return Response.json({ error: 'Wrong business' }, { status: 401 });
  if (!event.type.startsWith('subscription.'))
    return Response.json({ received: true, outcome: 'ignored' });
  try {
    const args = eventToRpc(
      eventId,
      event,
      process.env.DODO_PAYMENTS_BUSINESS_ID!,
    );
    const admin = getSupabaseServerAdminClient<FoundationDatabase>();
    const result = await admin.rpc('apply_dodo_subscription_event', args);
    if (result.error) throw result.error;
    return Response.json({ received: true, outcome: result.data });
  } catch {
    console.error('[billing] webhook_processing_failed', { eventId });
    // Non-2xx makes Dodo retry. Do not acknowledge before the transaction commits.
    return Response.json(
      { error: 'Event could not be applied' },
      { status: 500 },
    );
  }
}
