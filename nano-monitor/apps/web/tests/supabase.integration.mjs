import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

test('real Supabase sessions, cross-user RLS, and concurrent webhook delivery', async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error(
      'These integration tests require local Supabase; they must not run against production.',
    );
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clients = [
    createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  ];
  const ids = [];
  const marker = randomUUID();
  const check = (result) => {
    if (result.error) throw result.error;
    return result.data;
  };
  try {
    for (let i = 0; i < 2; i++) {
      const email = `foundation-${marker}-${i}@example.test`;
      const created = check(
        await admin.auth.admin.createUser({
          email,
          password: `Test-${marker}`,
          email_confirm: true,
        }),
      );
      ids.push(created.user.id);
      check(
        await clients[i].auth.signInWithPassword({
          email,
          password: `Test-${marker}`,
        }),
      );
    }
    const project = check(
      await clients[0]
        .from('projects')
        .insert({ user_id: ids[0], name: 'Only user A can see this' })
        .select('*')
        .single(),
    );
    assert.equal(
      check(await clients[1].from('projects').select('*').eq('id', project.id))
        .length,
      0,
    );
    assert.ok(
      (
        await clients[1]
          .from('projects')
          .insert({ user_id: ids[0], name: 'Forged owner' })
      ).error,
    );
    assert.equal(
      check(
        await clients[1]
          .from('projects')
          .delete()
          .eq('id', project.id)
          .select('id'),
      ).length,
      0,
    );
    check(
      await admin
        .from('billing_customers')
        .insert({ user_id: ids[0], customer_id: `cus_${marker}` }),
    );
    const event = {
      p_event_id: `evt_${marker}`,
      p_event_type: 'subscription.active',
      p_event_at: '2026-10-02T12:00:00Z',
      p_customer_id: `cus_${marker}`,
      p_subscription_id: `sub_${marker}`,
      p_product_id: 'prod_test',
      p_status: 'active',
      p_next_billing_date: '2026-11-02T12:00:00Z',
      p_expires_at: null,
      p_past_due_ends_at: null,
      p_cancel_at_next_billing_date: false,
    };
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, async () =>
        check(await admin.rpc('apply_dodo_subscription_event', event)),
      ),
    );
    assert.equal(outcomes.filter((value) => value === 'applied').length, 1);
    assert.equal(outcomes.filter((value) => value === 'duplicate').length, 7);
    assert.ok(
      (
        await clients[0].rpc('apply_dodo_subscription_event', {
          ...event,
          p_event_id: 'forged',
        })
      ).error,
    );
    check(
      await admin.rpc('apply_dodo_subscription_event', {
        ...event,
        p_event_id: `evt_cancel_${marker}`,
        p_event_at: '2026-10-02T13:00:00Z',
        p_status: 'cancelled',
        p_event_type: 'subscription.cancelled',
      }),
    );
    assert.equal(
      check(
        await admin.rpc('apply_dodo_subscription_event', {
          ...event,
          p_event_id: `evt_stale_${marker}`,
        }),
      ),
      'stale',
    );
  } finally {
    for (const id of ids) {
      await admin
        .from('billing_subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', id);
      check(await admin.auth.admin.deleteUser(id));
    }
  }
});
