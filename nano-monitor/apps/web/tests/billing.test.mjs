import assert from 'node:assert/strict';
import { test } from 'node:test';
import DodoPayments from 'dodopayments';
import { Webhook } from 'standardwebhooks';
import { eventToRpc, hasPaidAccess } from '../lib/billing/core.ts';

const now = Date.parse('2026-10-02T12:00:00Z');
const active = {
  product_id: 'prod_plus',
  status: 'active',
  next_billing_date: '2026-11-02T12:00:00Z',
  expires_at: null,
  past_due_ends_at: null,
};

test('access is server-derived, product-scoped, and expires without a webhook', () => {
  assert.equal(hasPaidAccess([active], 'prod_plus', now), true);
  assert.equal(hasPaidAccess([active], 'other', now), false);
  assert.equal(hasPaidAccess([active], undefined, now), false);
  assert.equal(
    hasPaidAccess(
      [{ ...active, next_billing_date: '2026-10-02T12:00:00Z' }],
      'prod_plus',
      now,
    ),
    false,
  );
  assert.equal(
    hasPaidAccess(
      [{ ...active, expires_at: '2026-10-01T00:00:00Z' }],
      'prod_plus',
      now,
    ),
    false,
  );
  for (const status of [
    'pending',
    'on_hold',
    'paused',
    'failed',
    'cancelled',
    'expired',
  ]) {
    assert.equal(
      hasPaidAccess([{ ...active, status }], 'prod_plus', now),
      false,
      status,
    );
  }
});

test('past-due access lasts only until the verified grace deadline', () => {
  assert.equal(
    hasPaidAccess(
      [
        {
          ...active,
          status: 'past_due',
          past_due_ends_at: '2026-10-03T00:00:00Z',
        },
      ],
      'prod_plus',
      now,
    ),
    true,
  );
  assert.equal(
    hasPaidAccess([{ ...active, status: 'past_due' }], 'prod_plus', now),
    false,
  );
  assert.equal(
    hasPaidAccess(
      [
        {
          ...active,
          status: 'past_due',
          past_due_ends_at: '2026-10-01T00:00:00Z',
        },
      ],
      'prod_plus',
      now,
    ),
    false,
  );
});

test('event mapping ignores user metadata and rejects wrong businesses or unsupported states', () => {
  const event = {
    type: 'subscription.active',
    timestamp: '2026-10-02T12:00:00Z',
    business_id: 'biz_ours',
    data: {
      subscription_id: 'sub_1',
      customer: { customer_id: 'cus_1' },
      product_id: 'prod_plus',
      status: 'active',
      next_billing_date: active.next_billing_date,
      cancel_at_next_billing_date: false,
      metadata: { user_id: 'attacker' },
    },
  };
  const args = eventToRpc('evt_1', event, 'biz_ours');
  assert.equal(args.p_customer_id, 'cus_1');
  assert.equal('user_id' in args, false);
  assert.throws(() => eventToRpc('evt_1', event, 'other'));
  assert.throws(() =>
    eventToRpc(
      'evt_1',
      { ...event, data: { ...event.data, status: 'unknown' } },
      'biz_ours',
    ),
  );
});

test('official SDK verifies a real Standard Webhooks signature and rejects tampering', () => {
  const secret = Buffer.from('local-test-secret-32-bytes-minimum').toString(
    'base64',
  );
  const verifier = new Webhook(secret);
  const client = new DodoPayments({
    bearerToken: 'test_only',
    webhookKey: secret,
  });
  const body = JSON.stringify({
    type: 'subscription.active',
    data: { subscription_id: 'sub_1' },
  });
  const timestamp = new Date();
  const headers = {
    'webhook-id': 'evt_signed',
    'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'webhook-signature': verifier.sign('evt_signed', timestamp, body),
  };
  assert.equal(
    client.webhooks.unwrap(body, { headers }).type,
    'subscription.active',
  );
  assert.throws(() =>
    client.webhooks.unwrap(body.replace('sub_1', 'sub_attacker'), { headers }),
  );
  assert.throws(() =>
    client.webhooks.unwrap(body, {
      headers: { ...headers, 'webhook-signature': 'v1,invalid' },
    }),
  );
});
