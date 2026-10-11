'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CreditCard, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '@kit/ui/button';
import {
  createCheckoutAction,
  createPortalAction,
} from '~/lib/server/billing-actions';

export type BillingModel = {
  preview?: boolean;
  configured: boolean;
  paid: boolean;
  hasCustomer: boolean;
  subscriptionStatus?: string;
  scheduledCancellation?: boolean;
  nextDate?: string | null;
  product?: { name: string; amount: string; period: string } | null;
  error?: string;
  returned?: boolean;
};
export function BillingView(model: BillingModel) {
  const router = useRouter();
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState(model.error);
  async function open(kind: 'checkout' | 'portal') {
    setBusy(kind);
    setError(undefined);
    try {
      const result = await (kind === 'checkout'
        ? createCheckoutAction()
        : createPortalAction());
      if (result.error) setError(result.error);
      else if (result.url) window.location.assign(result.url);
    } catch {
      setError('Billing could not be opened. Please try again.');
    } finally {
      setBusy(null);
    }
  }
  const product = model.preview
    ? { name: 'Plus', amount: '$12', period: 'month' }
    : model.product;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Your plan
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Review your plan and manage your subscription.
      </p>
      {model.returned && (
        <div
          role="status"
          className="bg-accent mt-6 rounded-xl border p-4 text-sm"
        >
          <p>
            {model.paid
              ? 'Your subscription is active.'
              : 'Checking your subscription. Access updates after payment is verified; returning from checkout alone does not confirm a payment.'}
          </p>
          <Button
            className="mt-3"
            variant="outline"
            data-test="refresh-billing"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="size-4" aria-hidden />
            Check again
          </Button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="text-destructive bg-card mt-6 rounded-xl border p-4 text-sm"
        >
          {error}
        </p>
      )}
      <section
        className="bg-card mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-[20px] sm:p-[24px]"
        aria-labelledby="current-plan"
      >
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            Current plan
          </p>
          <h2 id="current-plan" className="mt-1 text-xl font-semibold">
            {model.paid ? (product?.name ?? 'Paid plan') : 'Free'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {model.preview
              ? 'Example account · no active subscription'
              : model.scheduledCancellation
                ? 'Cancellation is scheduled for the end of your billing period.'
                : model.subscriptionStatus === 'past_due'
                  ? model.paid
                    ? 'Your payment needs attention. Access continues during the verified grace period.'
                    : 'Your payment needs attention. Paid access is unavailable until payment is verified.'
                  : model.subscriptionStatus
                    ? `Subscription status: ${model.subscriptionStatus.replaceAll('_', ' ')}`
                    : 'No active paid subscription.'}
          </p>
          {model.nextDate && (
            <p className="text-muted-foreground mt-1 text-sm">
              Next billing date:{' '}
              {new Date(model.nextDate).toLocaleDateString('en-US', {
                timeZone: 'UTC',
              })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          disabled={
            !!model.preview || !model.configured || !model.hasCustomer || !!busy
          }
          data-test="manage-billing"
          onClick={() => open('portal')}
        >
          <CreditCard className="size-4" aria-hidden />
          {busy === 'portal' ? 'Opening…' : 'Manage billing'}
        </Button>
      </section>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section
          className="bg-card flex flex-col rounded-xl border p-[20px] sm:p-[24px]"
          aria-labelledby="free-plan"
        >
          <h2 id="free-plan" className="text-xl font-semibold">
            Free
          </h2>
          <p className="mt-3 text-3xl font-semibold tracking-tight">$0</p>
          <p className="text-muted-foreground mt-2 text-sm">
            No subscription required.
          </p>
          <ul className="my-5 space-y-2 text-sm">
            <li className="flex gap-2">
              <Check className="text-primary size-5" aria-hidden />
              Personal workspace
            </li>
            <li className="flex gap-2">
              <Check className="text-primary size-5" aria-hidden />
              Account settings
            </li>
          </ul>
          <p className="text-muted-foreground mt-auto pt-2 text-sm">
            {!model.paid
              ? 'Your current plan'
              : 'Available without a paid subscription'}
          </p>
        </section>
        <section
          className="bg-card border-primary/40 flex flex-col rounded-xl border p-[20px] sm:p-[24px]"
          aria-labelledby="plus-plan"
        >
          <h2 id="plus-plan" className="text-xl font-semibold">
            {product?.name ?? 'Paid plan'}
          </h2>
          <p className="mt-3">
            <span className="text-3xl font-semibold tracking-tight">
              {product?.amount ?? '—'}
            </span>
            {product && (
              <span className="text-muted-foreground text-sm">
                {' '}
                / {product.period}
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {model.preview
              ? 'Example pricing for this preview.'
              : product
                ? 'Base price. Final taxes, discounts, and trial terms appear at checkout.'
                : 'Pricing will appear when payments are available.'}
          </p>
          <ul className="my-5 space-y-2 text-sm">
            <li className="flex gap-2">
              <Check className="text-primary size-5" aria-hidden />
              Everything in Free
            </li>
            <li className="flex gap-2">
              <Check className="text-primary size-5" aria-hidden />
              {model.preview
                ? 'Example paid feature'
                : 'Features included with this product'}
            </li>
          </ul>
          <Button
            className="mt-auto w-full"
            data-test="choose-paid"
            disabled={
              !!model.preview ||
              !model.configured ||
              !product ||
              model.paid ||
              !!busy
            }
            onClick={() => open('checkout')}
          >
            {busy === 'checkout'
              ? 'Preparing checkout…'
              : model.paid
                ? 'Your current plan'
                : 'Continue to checkout'}
            <ArrowUpRight className="size-4" aria-hidden />
          </Button>
          <p className="text-muted-foreground mt-3 text-xs">
            {model.preview
              ? 'Checkout is disabled in preview.'
              : 'Recurring subscription. Renewal and cancellation terms are shown before payment. Payments handled by Dodo Payments.'}
          </p>
        </section>
      </div>
    </>
  );
}
