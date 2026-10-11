# Product development rules

These rules record the user's preferences for applications built in this workspace.

## Scope and quality

- Build responsive web applications for desktop and phone. Native iOS and Android applications are outside the current scope.
- Design both layouts deliberately. Verify small phone widths, touch controls, keyboard navigation, loading, empty, error, and success states. Do not equate shrinking a desktop layout with a good phone experience.
- Use Dodo Payments for billing. Do not default to Stripe, Polar, or other processors.
- Prefer maintained open-source components and managed infrastructure. The user wants to supply an idea and reuse the common foundation across applications.

## Research before implementation

- Before implementing any substantial feature, search for maintained open-source libraries, reference implementations, and existing products that cover it. Evaluate complete solutions before inventing individual components.
- Check the actual source, license and dependencies, recent maintenance, relevant issues, compatibility, documentation, and tests. A README feature list, star count, or 'production-ready' label is insufficient evidence.
- Prefer MIT, Apache-2.0, BSD, or similarly permissive components for a reusable commercial foundation. Review copyleft and source-available components individually; do not assume a repository's root license covers its dependencies. Public source with no license is not automatically reusable.
- Use a library when it reduces total implementation and maintenance work. Do not force a poor fit merely to meet a code percentage.
- Aim for very little custom code, approximately 5% where realistic. Never promise that exact percentage for an arbitrary idea. Custom code should implement distinctive behavior and the necessary integration between proven components.
- Preserve licenses and record upstream URLs and exact revisions. Recheck advisories before each launch; a past audit is not permanent approval.

## Shared foundation

- This checkout is the reusable App Foundation. Use create:app to create a separate app, read SETUP.md, and consult foundation-verification.json for actual evidence. Replace the sample project entity and layout as needed; do not copy real credentials or share production customer data.

- Consult research/foundation-selection.json for the dated evaluation and recommended stack. It is a research decision, not proof of a configured or deployed service.
- Preferred starting point: MakerKit Lite with Next.js, Supabase Auth/Postgres/Storage, its shadcn UI components, and Dodo's official Apache-2.0 TypeScript SDK.
- Before using the audited MakerKit revision, upgrade its Next.js and bundle-analyzer dependencies to an advisory-checked stable release, regenerate the lockfile, and run the checks.
- Remove its unused @makerkit/data-loader-supabase-core and @makerkit/data-loader-supabase-nextjs dependencies unless their licenses and actual need are resolved. Use Supabase's MIT SDK for database queries.
- Implement Dodo billing once as a shared module. Reuse the official SDK for checkout sessions, customer portal sessions, API types, and webhook signature verification. Do not write payment cryptography or accept placeholder verification.
- Persist payment-event IDs with a unique constraint and apply event effects atomically. Test duplicate and concurrent delivery, retries after failures, and stale events. Protect credits and paid access on the server.
- Derive billing customer IDs and account ownership from authenticated server state. Do not trust IDs, prices, paid status, or user metadata supplied by the browser. A checkout success redirect is not proof of payment.
- Separate every application's production data and credentials. Reuse code and setup patterns; do not unintentionally share customer data across independent products.
- Enable automated desktop and mobile browser checks. The audited MakerKit snapshot only enables Desktop Chrome and makes its E2E CI job opt-in.
- Treat email delivery, error tracking, backups/restores, rate limits, background jobs, account deletion, and deployment configuration as reusable modules that must be enabled and verified when applicable.

## Product ownership and UX/UI

- Read design/product-standard.json before designing an application's experience. Use design/review-template.json for a proportionate evidence record in that app's workspace.
- Own the complete experience within the agreed scope. Resolve hierarchy, wording, interaction, responsive behavior, and reliability problems proactively instead of waiting for the user to identify each defect.
- Start with the user's intended outcome and the journeys that make this particular app useful. Choose layout and navigation for those tasks; do not inherit a generic dashboard or copy MediaWorks' document layout by default.
- Reuse infrastructure, components, and design conventions while preserving each product's appropriate interaction model and identity. A library does not decide the product experience.
- Keep important controls discoverable. Fewer visible controls is not automatically better; compare the cost of clutter with the cost of hiding frequent actions.
- Preserve requested capabilities. Improving existing flows does not authorize silent feature removal or additional product scope.
- Review working journeys on phone and desktop with realistic content and relevant failures. Report evidence and remaining uncertainty; do not claim excellent usability from screenshots or self-awarded scores.
- Before presenting UI as ready, perform a separate critique after functional tests: inspect hierarchy, phone-specific presentation, visible feedback, all navigation destinations, missing-page recovery, enlarged text, and constrained forms. Fix observed defects within scope; an automated pass is not the stopping rule.

## Honest completion

- Distinguish source inspection, dependency advisory checks, local tests, sandbox integration tests, and production verification.
- Do not claim the backend is ready merely because a template has been downloaded. Service accounts, credentials, products, webhooks, and deployment still need configuration.
- Run meaningful checks for authentication, cross-user access, billing, and the product's critical workflow. Present a working preview and explain any unverified external integrations.

## Standing editing brief
When given a video or camera dump to edit, deliver a YouTube landscape edit plus
vertical Instagram Reels from the same original footage. Read
`design/editing-style.json` and the user's saved editing-foundation HTML first.
Use restrained white Helvetica/Arial-style type by default; optional neon pink
only when the mood suits it. Avoid software dashboards, monospace tech headings
and flashy decorations. Pending assets are references, not approved for reuse.
Review speech and visuals across the whole dump for a coherent story; recording
order alone does not establish a story. Keep all new media/caches on USB or D:.
