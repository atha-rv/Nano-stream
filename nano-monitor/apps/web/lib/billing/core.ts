import { z } from 'zod';

export const SubscriptionEventSchema = z.object({
  type: z.string().startsWith('subscription.'),
  timestamp: z.iso.datetime({ offset: true }),
  business_id: z.string().min(1),
  data: z.object({
    subscription_id: z.string().min(1),
    customer: z.object({ customer_id: z.string().min(1) }),
    product_id: z.string().min(1),
    status: z.enum([
      'pending',
      'active',
      'past_due',
      'on_hold',
      'paused',
      'failed',
      'cancelled',
      'expired',
    ]),
    next_billing_date: z.iso.datetime({ offset: true }).nullable().optional(),
    expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
    past_due_ends_at: z.iso.datetime({ offset: true }).nullable().optional(),
    cancel_at_next_billing_date: z.boolean(),
  }),
});

type AccessSubscription = {
  status: string;
  product_id: string;
  next_billing_date: string | null;
  expires_at: string | null;
  past_due_ends_at: string | null;
};

export function hasPaidAccess(
  subscriptions: AccessSubscription[],
  productId: string | undefined,
  now = Date.now(),
): boolean {
  if (!productId) return false;
  const future = (date: string | null) =>
    date !== null && Date.parse(date) > now;
  return subscriptions.some((subscription) => {
    if (subscription.product_id !== productId) return false;
    if (subscription.status === 'past_due')
      return future(subscription.past_due_ends_at);
    if (subscription.status !== 'active') return false;
    if (subscription.expires_at && !future(subscription.expires_at))
      return false;
    return future(subscription.next_billing_date);
  });
}

// Provider status is authoritative: scheduled cancellation stays active until
// the period ends. A cancelled/paused/on_hold subscription has no paid access.
// This baseline supports ordinary recurring subscriptions and trials. Usage,
// credits, on-demand billing and one-time fulfilment need their own modules.
export function eventToRpc(eventId: string, raw: unknown, businessId: string) {
  const event = SubscriptionEventSchema.parse(raw);
  if (event.business_id !== businessId)
    throw new Error('Webhook business mismatch');
  return {
    p_event_id: eventId,
    p_event_type: event.type,
    p_event_at: event.timestamp,
    p_customer_id: event.data.customer.customer_id,
    p_subscription_id: event.data.subscription_id,
    p_product_id: event.data.product_id,
    p_status: event.data.status,
    p_next_billing_date: event.data.next_billing_date ?? null,
    p_expires_at: event.data.expires_at ?? null,
    p_past_due_ends_at: event.data.past_due_ends_at ?? null,
    p_cancel_at_next_billing_date: event.data.cancel_at_next_billing_date,
  };
}
