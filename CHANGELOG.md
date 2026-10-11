# Changelog

## 0.2.1 — 2026-10-11

- Show camera thumbnails in desktop and phone gallery rows, with lazy loading,
  a visible unavailable fallback and Retry previews.
- Restrict preview requests to known gallery IDs and the current camera session;
  bound concurrent camera requests, image size and memory cache usage.
- Verify five JPEG previews on the actual Nano and failure/retry in the UI.

## 0.2.0 — 2026-10-11

- Add desktop camera gallery with older-page retrieval, Today/Past 7 days/Last
  5/Last 10/All/date-range filters, automatic matching selections and manual
  selection/deselection.
- Add selected original downloads, progress/cancellation, existing-file conflict
  protection and chronological editing manifests with durable completed-file
  journals. Reuse the transfer path for Stop & save.
- Add a separate optional word-timed local transcription/intake CLI with caches
  on the footage drive; integrated automatic editing remains unimplemented.
- Add a standalone approved-assets HTML foundation and standing YouTube/Reels
  style brief: plain white Helvetica/Arial-style text, optional neon pink.
- Test actual two-page Nano discovery, two USB downloads, full decode and local
  transcription; expand storage/worker/IPC/filter/foundation contract checks.

## 0.1.0 — 2026-10-11

- Publish Nano Monitor's Windows Electron source and wireless Nano camera bridge.
- Preserve Record/Stop, live preview, original transfer and Wi-Fi restoration.
- Automatic external USB storage with D: fallback and explicit preferences.
- Add drive-aware editing helper, connection instructions and locked runtime provenance.
- Add configurable desktop build paths and a prerequisite/setup script.
- Add storage/IPC CI checks, source-only exclusions and daily editing research.

No portable installer, automatic daily editor or social upload integration is
included in this initial source release.
