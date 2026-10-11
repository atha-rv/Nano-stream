import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL semantics in-process. The Supabase auth/storage services and
// multi-connection locking must also be tested against Supabase before launch.
const db = new PGlite();
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const migration = new URL(
  '../supabase/migrations/20261002090000_foundation.sql',
  import.meta.url,
);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth, public to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${userA}'), ('${userB}');
  `);
  await db.exec(await readFile(migration, 'utf8'));
  await db.exec(
    `insert into public.billing_customers(user_id, customer_id) values ('${userA}', 'cus_a'), ('${userB}', 'cus_b')`,
  );
});
after(async () => {
  await db.close();
});

async function deliver(
  id,
  time = '2026-10-02T12:00:00Z',
  status = 'active',
  extra = {},
) {
  return db.query(
    `select public.apply_dodo_subscription_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as outcome`,
    [
      id,
      `subscription.${status}`,
      time,
      extra.customer ?? 'cus_a',
      extra.subscription ?? 'sub_a',
      'prod_plus',
      status,
      '2026-11-02T12:00:00Z',
      null,
      null,
      false,
    ],
  );
}

test('project RLS prevents cross-user reads, inserts, deletes and billing modification', async () => {
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub = '${userA}';`,
  );
  await db.query('insert into public.projects(user_id, name) values ($1,$2)', [
    userA,
    'Private project',
  ]);
  await assert.rejects(
    db.query('insert into public.projects(user_id, name) values ($1,$2)', [
      userB,
      'Forged owner',
    ]),
    /row-level security/,
  );
  await assert.rejects(
    db.exec("update public.billing_customers set customer_id = 'forged'"),
    /permission denied/,
  );
  await assert.rejects(deliver('forged-event'), /permission denied/);
  await db.exec(`set request.jwt.claim.sub = '${userB}';`);
  assert.equal(
    (await db.query('select * from public.projects')).rows.length,
    0,
  );
  assert.equal(
    (await db.query('delete from public.projects returning id')).rows.length,
    0,
  );
  await db.exec('reset role;');
  assert.equal(
    (await db.query('select * from public.projects')).rows.length,
    1,
  );
});

test('event replay is durable and has one effect', async () => {
  assert.equal((await deliver('evt_initial')).rows[0].outcome, 'applied');
  assert.equal((await deliver('evt_initial')).rows[0].outcome, 'duplicate');
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.billing_events where event_id = 'evt_initial'",
      )
    ).rows[0].n,
    1,
  );
});

test('stale or equal-timestamp activation cannot restore revoked access', async () => {
  await deliver('evt_cancelled', '2026-10-02T13:00:00Z', 'cancelled');
  assert.equal(
    (await deliver('evt_old', '2026-10-02T12:30:00Z')).rows[0].outcome,
    'stale',
  );
  assert.equal(
    (await deliver('evt_equal', '2026-10-02T13:00:00Z')).rows[0].outcome,
    'stale',
  );
  assert.equal(
    (
      await db.query(
        "select status from public.billing_subscriptions where subscription_id = 'sub_a'",
      )
    ).rows[0].status,
    'cancelled',
  );
});

test('a restrictive event wins an equal-timestamp race against active state', async () => {
  await deliver('evt_fresh', '2026-10-02T14:00:00Z');
  assert.equal(
    (await deliver('evt_hold_equal', '2026-10-02T14:00:00Z', 'on_hold')).rows[0]
      .outcome,
    'applied',
  );
  assert.equal(
    (
      await db.query(
        "select status from public.billing_subscriptions where subscription_id = 'sub_a'",
      )
    ).rows[0].status,
    'on_hold',
  );
});

test('a failed transition rolls back its receipt so the same ID can be retried', async () => {
  await assert.rejects(
    deliver('evt_retry', '2026-10-02T15:00:00Z', 'unsupported'),
    /check constraint/,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.billing_events where event_id = 'evt_retry'",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await deliver('evt_retry', '2026-10-02T15:00:00Z')).rows[0].outcome,
    'applied',
  );
});

test('an unknown customer can retry after mapping arrives, and ownership cannot move', async () => {
  await assert.rejects(
    deliver('evt_unmapped', '2026-10-02T16:00:00Z', 'active', {
      customer: 'cus_new',
      subscription: 'sub_new',
    }),
    /mapping not available/,
  );
  await db.query('delete from public.billing_customers where user_id = $1', [
    userB,
  ]);
  await db.query(
    'insert into public.billing_customers(user_id,customer_id) values ($1,$2)',
    [userB, 'cus_new'],
  );
  assert.equal(
    (
      await deliver('evt_unmapped', '2026-10-02T16:00:00Z', 'active', {
        customer: 'cus_new',
        subscription: 'sub_new',
      })
    ).rows[0].outcome,
    'applied',
  );
  await assert.rejects(
    deliver('evt_wrong_owner', '2026-10-02T17:00:00Z', 'active', {
      customer: 'cus_new',
    }),
    /ownership mismatch/,
  );
});

test('billing state is readable only by its owner; receipts and limits are private', async () => {
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub = '${userB}';`,
  );
  const rows = (await db.query('select * from public.billing_subscriptions'))
    .rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, userB);
  await assert.rejects(
    db.query('select * from public.billing_events'),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select * from public.request_limits'),
    /permission denied/,
  );
  await db.exec('reset role;');
});

test('shared request limiter rejects excess requests and resets expired windows', async () => {
  for (let i = 0; i < 4; i++) {
    const result = await db.query(
      "select public.take_request_slot('checkout:user', 3, 60) as allowed",
    );
    assert.equal(result.rows[0].allowed, i < 3);
  }
  await db.exec(
    "update public.request_limits set window_start = now() - interval '61 seconds'",
  );
  assert.equal(
    (
      await db.query(
        "select public.take_request_slot('checkout:user', 3, 60) as allowed",
      )
    ).rows[0].allowed,
    true,
  );
});

test('checkout claims block existing subscriptions and serialize repeated requests', async () => {
  assert.equal(
    (await db.query('select public.claim_checkout($1) as claim', [userA]))
      .rows[0].claim.result,
    'subscribed',
  );
  const userC = '33333333-3333-4333-8333-333333333333';
  await db.query('insert into auth.users values ($1)', [userC]);
  assert.equal(
    (await db.query('select public.claim_checkout($1) as claim', [userC]))
      .rows[0].claim.result,
    'claimed',
  );
  assert.equal(
    (await db.query('select public.claim_checkout($1) as claim', [userC]))
      .rows[0].claim.result,
    'busy',
  );
  await db.query(
    "update public.billing_checkout_sessions set checkout_url = 'https://checkout.dodopayments.com/test', expires_at = now() + interval '1 hour' where user_id = $1",
    [userC],
  );
  assert.equal(
    (await db.query('select public.claim_checkout($1) as claim', [userC]))
      .rows[0].claim.result,
    'existing',
  );
  await assert.rejects(
    db.query('delete from auth.users where id = $1', [userC]),
    /Cancel existing billing/,
  );
  await db.query(
    "update public.billing_checkout_sessions set expires_at = now() - interval '1 hour', lock_until = now() where user_id = $1",
    [userC],
  );
  await db.query('delete from auth.users where id = $1', [userC]);
});

test('account deletion is blocked while subscriptions can still charge', async () => {
  await assert.rejects(
    db.query('delete from auth.users where id = $1', [userA]),
    /Cancel existing billing/,
  );
});
