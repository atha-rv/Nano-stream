'use server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { requireUser } from '@kit/supabase/require-user';
import appConfig from '~/config/app.config';
import type { FoundationDatabase } from '~/lib/foundation.types';
import {
  billingIsConfigured,
  getDodoClient,
  readPaidProduct,
} from '~/lib/billing/server';

async function context(operation: string) {
  const client = getSupabaseServerClient<FoundationDatabase>();
  const identity = await requireUser(client);
  if (identity.error)
    return { error: 'Sign in again to manage billing.' } as const;
  if (!billingIsConfigured())
    return {
      error: 'Payments are not available yet. Please try again later.',
    } as const;
  const admin = getSupabaseServerAdminClient<FoundationDatabase>();
  const { data, error } = await admin.rpc('take_request_slot', {
    p_key: `${operation}:${identity.data.sub}`,
    p_limit: 5,
    p_seconds: 60,
  });
  if (error) throw error;
  if (!data)
    return { error: 'Please wait a minute before trying again.' } as const;
  return { client, admin, userId: identity.data.sub } as const;
}
function safeProviderUrl(value: string | null | undefined) {
  if (!value) throw new Error('Missing payment URL');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !(
      url.hostname === 'dodopayments.com' ||
      url.hostname.endsWith('.dodopayments.com')
    )
  )
    throw new Error('Unexpected payment URL');
  return value;
}

export async function createCheckoutAction(): Promise<{
  url?: string;
  error?: string;
}> {
  let release: (() => Promise<unknown>) | undefined;
  try {
    const ctx = await context('checkout');
    if ('error' in ctx) return { error: ctx.error };
    const claim = await ctx.admin.rpc('claim_checkout', {
      p_user_id: ctx.userId,
    });
    if (claim.error) throw claim.error;
    if (claim.data.result === 'subscribed')
      return {
        error:
          'You already have a subscription. Use Manage billing to review it.',
      };
    if (claim.data.result === 'busy')
      return {
        error: 'Checkout is already being prepared. Try again in a moment.',
      };
    if (claim.data.result === 'existing')
      return { url: safeProviderUrl(claim.data.url) };
    release = async () =>
      await ctx.admin
        .from('billing_checkout_sessions')
        .update({ lock_until: new Date().toISOString() })
        .eq('user_id', ctx.userId);
    await readPaidProduct();
    const dodo = getDodoClient();
    let customerId: string;
    const lookup = await ctx.admin
      .from('billing_customers')
      .select('customer_id')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (lookup.error) throw lookup.error;
    if (lookup.data) customerId = lookup.data.customer_id;
    else {
      const { data: identity, error } = await ctx.client.auth.getUser();
      if (error || !identity.user?.email || identity.user.id !== ctx.userId)
        throw new Error('Verified account missing');
      const customer = await dodo.customers.create({
        email: identity.user.email,
        name: identity.user.user_metadata?.name || identity.user.email,
      });
      const mapping = await ctx.admin
        .from('billing_customers')
        .insert({ user_id: ctx.userId, customer_id: customer.customer_id });
      if (mapping.error) throw mapping.error;
      customerId = customer.customer_id;
    }
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        { product_id: process.env.DODO_PAYMENTS_PRODUCT_ID!, quantity: 1 },
      ],
      customer: { customer_id: customerId },
      return_url: `${appConfig.url}/home/billing?checkout=returned`,
      cancel_url: `${appConfig.url}/home/billing`,
    });
    const url = safeProviderUrl(session.checkout_url);
    const stored = await ctx.admin
      .from('billing_checkout_sessions')
      .update({
        session_id: session.session_id,
        checkout_url: url,
        expires_at: new Date(Date.now() + 23.9 * 3600000).toISOString(),
        lock_until: new Date().toISOString(),
      })
      .eq('user_id', ctx.userId);
    if (stored.error) throw stored.error;
    release = undefined;
    return { url };
  } catch {
    if (release) await release().catch(() => undefined);
    console.error('[billing] checkout_failed');
    return {
      error:
        'Checkout could not be opened. You have not been charged by this action. Please try again.',
    };
  }
}

export async function createPortalAction(): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    const ctx = await context('portal');
    if ('error' in ctx) return { error: ctx.error };
    const lookup = await ctx.admin
      .from('billing_customers')
      .select('customer_id')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (lookup.error) throw lookup.error;
    if (!lookup.data)
      return { error: 'There is no billing account to manage yet.' };
    const portal = await getDodoClient().customers.customerPortal.create(
      lookup.data.customer_id,
      { send_email: false, return_url: `${appConfig.url}/home/billing` },
    );
    return { url: safeProviderUrl(portal.link) };
  } catch {
    console.error('[billing] portal_failed');
    return { error: 'Billing could not be opened. Please try again.' };
  }
}
