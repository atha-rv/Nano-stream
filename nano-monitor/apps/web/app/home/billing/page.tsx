import { Suspense } from 'react';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';
import { billingIsConfigured, readPaidProduct } from '~/lib/billing/server';
import { hasPaidAccess } from '~/lib/billing/core';
import type { FoundationDatabase } from '~/lib/foundation.types';
import { BillingView } from '~/components/foundation/billing-view';

export default function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">Loading your plan…</p>}>
      <AccountBilling searchParams={searchParams} />
    </Suspense>
  );
}
async function AccountBilling({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await requireUserInServerComponent();
  const client = getSupabaseServerClient<FoundationDatabase>();
  const [customers, subscriptions, params] = await Promise.all([
    client
      .from('billing_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    client
      .from('billing_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_event_at', { ascending: false }),
    searchParams,
  ]);
  let product = null;
  let productError: string | undefined;
  try {
    product = await readPaidProduct();
  } catch {
    productError =
      'Pricing could not be loaded. Please refresh before starting checkout.';
  }
  const current = subscriptions.data?.[0];
  return (
    <BillingView
      configured={billingIsConfigured()}
      paid={hasPaidAccess(
        subscriptions.data ?? [],
        process.env.DODO_PAYMENTS_PRODUCT_ID,
      )}
      hasCustomer={!!customers.data}
      product={product}
      subscriptionStatus={current?.status}
      scheduledCancellation={current?.cancel_at_next_billing_date}
      nextDate={current?.next_billing_date}
      returned={params.checkout === 'returned'}
      error={
        customers.error || subscriptions.error
          ? 'Your billing information could not be loaded. Please try again.'
          : productError
      }
    />
  );
}
