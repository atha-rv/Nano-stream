# Connect a new app

The local prototype works without service credentials. Real auth, shared persistence, email, storage, and payments require app-specific configuration.

## Runtime

Use Node >=24.19.0 and pnpm 11.19.0. On this computer Codex's bundled Node is newer than the system Node; `Run-Preview.ps1` selects the bundled runtime when available. The package manager and lockfile are pinned. Install with `pnpm install --frozen-lockfile`.

Copy `apps/web/.env.example` to `apps/web/.env.local` (the app creation script does this). Never commit `.env.local` or put service-role/API/webhook keys in `NEXT_PUBLIC_*` variables. Configuration checks print names, never values.

## Supabase

1. Create a separate Supabase project for this app. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and later in the hosting provider's secrets.
2. Apply both migrations from `apps/web/supabase/migrations`. Link with `pnpm --filter web exec supabase link --project-ref YOUR_PROJECT_REF`, then apply with `pnpm --filter web exec supabase db push`. Review the destination before applying; the template never deploys migrations automatically to a remote project.
3. Set Auth's Site URL and redirect allowlist to the app's actual origin and `/auth/callback`, `/auth/confirm`, and `/update-password` paths used by the flows. Match the app's `NEXT_PUBLIC_SITE_URL`. Use exact trusted redirect URLs.
4. Configure production SMTP, sender identity, email verification/reset templates, password policy, and auth rate limits in Supabase. Its local mail catcher is for tests; it is not production email delivery.
5. Google is off by default. Set up Google's OAuth credentials and Supabase provider before enabling `NEXT_PUBLIC_AUTH_GOOGLE=true`.
6. Test two real accounts against project and avatar policies; test verification, recovery, profile updates, MFA when enabled, and account deletion. Run type generation after migrating: `pnpm supabase:web:typegen`. The template's additional schema types are explicit until full types are generated.

## Dodo Payments

1. Start in `DODO_PAYMENTS_ENVIRONMENT=test_mode`. Add server-only `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PAYMENTS_BUSINESS_ID`, and `DODO_PAYMENTS_PRODUCT_ID`.
2. Create an ordinary recurring product in Dodo. Live price and interval are read from that product; the `$12/month` preview is only sample pricing. Replace the generic plan feature descriptions with the product's actual benefits.
3. Register `https://YOUR_APP/api/webhooks/dodo`. Subscribe to all relevant subscription events, including active, renewed, updated, plan_changed, past_due, on_hold, paused, unpaused, cancelled, expired, and failed. Verify the available event names in your merchant dashboard; do not rely on a static list forever.
4. Customer IDs come from the authenticated account's server-owned mapping. The browser supplies no customer ID, price, paid status, or SKU. Signatures use the official SDK's `unwrap` method.
5. Configure the customer portal's renewal/cancellation behavior and recovery settings. Scheduled cancellation retains active access until the verified period ends; paused/on_hold/cancelled/failed/expired states revoke access. A verified grace deadline bounds past_due access. Missing or unknown state fails closed.
6. Exercise successful and declined test checkout, return before webhook, retries, simultaneous duplicates, out-of-order events, grace-period expiry, pause/resume, cancellation, and the portal. Payment return URLs never grant access. Use `requirePaidAccess()` in every paid server operation, not just the visible UI.
7. Account deletion is blocked while subscriptions can still charge, checkout is being prepared, or an unexpired checkout is outstanding. Cancel in the portal and wait for the verified status. A failed deletion keeps the session available for recovery.
8. This module covers recurring subscriptions and trials. One-time fulfilment, credit ledgers, usage/on-demand billing, refunds/disputes with product-specific effects, and reconciliation jobs are separate requirements when an idea needs them. Remote API and database operations cannot share a transaction; monitor creation failures and reconcile rare orphan provider customers/sessions. Alerts and operational retention need hosting configuration.

## Launch

Set `TEMPLATE_PREVIEW_ENABLED=false`, an HTTPS site URL, hosted Supabase credentials, and `DODO_PAYMENTS_ENVIRONMENT=live_mode` with live-mode product and secrets. Run `pnpm check:setup --production` and `pnpm build`.

The configuration check confirms required values are present; it does not prove their validity. Before launch verify the deployed auth/email/storage/payment journeys, replace the legal-page placeholders, configure backups and test a restore, set service quotas and monitoring/alerts, and review current dependency advisories. Confirm that browser origins and webhook URLs match this specific app. Use a Node-capable Next.js host with server actions and route handlers; a static-file host cannot run this backend. The legacy auth test email helper uses the local mail API; confirm its compatibility with your installed Supabase CLI when updating the CLI.

`Permissions-Policy` disables camera, microphone, and geolocation in the base. Enable only the relevant capability when a product requires it and request permission at the point of use.

Every future app gets its own product brief, chosen interaction model, relevant library search, and review evidence. Preserve shared behavior while changing the example screens to fit the idea.
