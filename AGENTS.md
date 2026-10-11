# Nano-stream development

Keep this Windows desktop camera utility local. Preserve working Record/Stop,
wireless preview, original transfer, normal Wi-Fi restoration and explicit
storage preferences. No camera deletion is exposed. Keep credentials, tokens,
footage, transcripts, model caches and runtime data out of commits.

New footage defaults to a connected external USB drive, otherwise D:\Osmo Nano.
An in-progress transfer must stay on its original volume; do not switch drives
mid-write. New edit files and temporary media belong beside the source.

Research upstream source, licensing, maintenance, dependencies and relevant
issues before substantial additions. Preserve licenses, exact revisions and
lockfiles. Follow the retained product instructions in nano-monitor/AGENTS.md
where applicable; the explicitly requested Windows desktop app takes priority
over the foundation's web-only default. Billing/auth are inapplicable here.

Run storage and IPC tests for related changes. Camera hardware tests must
distinguish observed results from simulations and preserve existing recordings.
Do not claim the daily editor or social upload integrations exist before they
are implemented and tested. Read docs/DAILY-EDITING.md for the proposed workflow.
