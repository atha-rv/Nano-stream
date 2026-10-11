import 'server-only';
import DodoPayments from 'dodopayments';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { requireUser } from '@kit/supabase/require-user';
import type { FoundationDatabase } from '~/lib/foundation.types';
import { hasPaidAccess } from './core';

export function billingIsConfigured() {
  return !!(
    process.env.DODO_PAYMENTS_API_KEY &&
    process.env.DODO_PAYMENTS_PRODUCT_ID &&
    process.env.DODO_PAYMENTS_WEBHOOK_KEY &&
    process.env.DODO_PAYMENTS_BUSINESS_ID
  );
}
export function getDodoClient() {
  if (!process.env.DODO_PAYMENTS_API_KEY)
    throw new Error('Billing is not configured');
  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT ?? 'test_mode';
  if (environment !== 'test_mode' && environment !== 'live_mode')
    throw new Error('Invalid Dodo environment');
  return new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment,
    timeout: 15000,
    maxRetries: 1,
  });
}
export async function requirePaidAccess() {
  const client = getSupabaseServerClient<FoundationDatabase>();
  const identity = await requireUser(client);
  if (identity.error) throw new Error('Authentication required');
  const { data, error } = await client
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', identity.data.sub);
  if (error || !hasPaidAccess(data ?? [], process.env.DODO_PAYMENTS_PRODUCT_ID))
    throw new Error('Paid plan required');
  return identity.data;
}
export async function readPaidProduct() {
  if (!billingIsConfigured()) return null;
  const product = await getDodoClient().products.retrieve(
    process.env.DODO_PAYMENTS_PRODUCT_ID!,
  );
  if (product.price.type !== 'recurring_price')
    throw new Error('The baseline requires a recurring product');
  const price = product.price;
  const digits =
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency,
  }).format(price.price / 10 ** digits);
  const period = `${price.payment_frequency_count === 1 ? '' : `${price.payment_frequency_count} `}${price.payment_frequency_interval.toLowerCase()}${price.payment_frequency_count === 1 ? '' : 's'}`;
  return { name: product.name ?? 'Plus', amount, period };
}
