# Camera library and download research — 2026-10-11

The existing Windows camera integration is pinned MIT OsmoOffload
`9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f`. Its actual `query_newest_page`
source requests at most 45 records per storage. Those include photos; filtering
to videos does not establish that all videos are loaded. Keep its manifest
decoder, HTTP planner/downloader, history database and resumable partial-file
behavior rather than replacing the complete transfer stack.

The Android [Osmosis source at the inspected revision](https://github.com/KonradIT/osmosis/tree/6992036abc29a01126a728443f1d29a83a7ef467)
provides a useful complete library reference. It was unarchived, with a recent
2026-09-17 push at inspection. The Android application/runtime is not a Windows
drop-in. Its MIT `LICENSE.txt` is retained as `camera/LICENSE-Osmosis` because
the pagination flow/end-marker interpretation informed the adaptation.

Inspected actual `CameraSession.kt` implementations: independent SD/internal
cursors, counter-qualified manifests, cursor overlap deduplication, older-handle
advancement, terminal marker `0c010d`, incomplete header counts, session restart
fallback, repeated pages and empty storage answers. Inspected upstream
pagination/invariant/golden test paths; upstream tests were not executed here.
The relevant protocol source is linked in `camera/gallery.py` with the exact
revision. Photos are retained while calculating page fullness and cursor
advancement, then excluded from the selectable video list.

The implementation stays within the existing serialized camera worker: SD query,
trigger, internal query, then reuse the upstream frame reassembler and decoder.
It restarts the playback session once after a failed page and preserves a partial
list with a warning if retry fails. It bounds scans to 100 pages/four minutes.
It never calls a truncated/repeated/unanswered page an empty complete library.
An answered, empty stream is treated as empty storage, following observed Nano
behavior; absence and unreadability cannot always be distinguished by this
undocumented interface.

For selection, reuse React, the existing Base UI Button wrapper and a native
modal HTML dialog. No gallery framework or new runtime dependency is needed
for filename/date/size selection. Clip playback is outside this change.
Native browser file APIs suffice for the standalone approval foundation; saving
has a download fallback when File System Access is unavailable. Helvetica is not
redistributed; system Arial/sans-serif is the fallback until a licensed approved
font is supplied.

Verification: simulated independent-store paging, cursor overlap, truncation,
no answers, repeated pages, cancellation/page limits, safe filenames and durable
manifests. Worker methods run with deterministic camera/volume adapters; those
are simulations, not protocol or physical-unplug tests. On one real Nano:
**48 videos, two pages, reported complete**, two chosen original files copied to
USB, metadata probed and both fully decoded by FFmpeg. Normal Wi-Fi restored.
Larger libraries, other firmware and physical mid-transfer removal remain
unverified. No independent total-file count or camera checksum is available.

No dependencies changed for this feature. Existing desktop audit on this date
reported zero known advisories; the retained web/build stack still has the
documented unpatched braces advisory. This is dated evidence, not permanent
approval for redistributing every future upstream version.

## Thumbnail follow-up — 2026-10-11

Inspected pinned Osmosis `PathAddressing.kt`, `ImageLoader.kt`, manifest parsing
and addressing tests, and pinned OsmoOffload `CameraHttp.fetch_small` plus its Qt controller's
`_fetch_thumbs` implementation. That complete desktop flow uses the same
sidecars but writes thumbnails under its configuration folder; this app uses
bounded memory to respect the footage-storage preference. Rechecked
Osmosis maintenance/license/open issues: MIT, unarchived, last push September
17; the open issues inspected concern other models/drone integration. Its
Android bitmap/UI runtime is not appropriate for Electron. Reuse the established
`.scr` then `.thm` camera-sidecar addressing and native browser image decoding;
no additional image library or dependency is required. The retained MIT license
covers the reference adaptation; upstream tests were inspected, not run.

Only known gallery IDs from the current session resolve to camera thumbnail
paths. Requests retain the private bridge header, reject arbitrary media paths,
cap each JPEG at 512 KB, allow two camera HTTP tasks at a time, and cache at most
16 MB/128 entries in memory. Session reset prevents stale requests populating
another camera's cache. No original footage is fetched to construct thumbnails.
Offline cached previews remain usable; unavailable images retain selection and
have an explicit retry action. Missing/invalid renditions are not camera errors.

Hardware check: all five selected actual Nano previews returned JPEGs (24–112 KB)
and decoded in the browser at 1280×720. Unauthorized requests returned 403;
unknown gallery IDs returned 404. The camera session disconnected normally.
Browser tests used a local fixture with these real previews; fallback/retry,
keyboard selection, Escape/focus return and phone layout were checked separately.
Other firmware and all 48 thumbnails were not verified.

### Large-download stall repair — 2026-10-11

The live pump serviced presence and transport ACKs inline. Both gallery copying
and Stop & save called the blocking HTTP offloader, suspending those heartbeats.
User logs showed AP loss on a large original and an unchanged partial at 30%.
Reuse the already pinned OsmoOffload `CameraDatalink.start_keepalive()` and
`stop_keepalive()` around the entire transfer, including HEAD planning, partial
prefix hashing and HTTP retry waits. Upstream's own controller holds this same
worker through its HTTP phase:
https://github.com/intermittech/OsmoOffload/blob/9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f/src/osmooffload/ui/controller.py
No new dependency or copy of the upstream protocol implementation was needed.
Stop the keepalive in `finally` before the main pump resumes exclusive socket
ownership; keep recording actions serialized. The existing Wi-Fi rejoin hook
and Range resume remain in use. Recovery text and bytes are visible inside the
gallery instead of being obscured behind its modal.

Hardware evidence: a 2,391,154,605-byte 4K original resumed from its preserved
715,128,832-byte partial to a complete USB file and complete batch manifest.
A further reset near 2.25 GB recovered with rejoin and resume. Normal Wi-Fi was
restored afterward. Camera size and the local receive hash were checked; no
independent camera checksum is supplied by this protocol. Regression checks
cover keepalive during planning/copying, cleanup after preflight/copy failures,
cancellation preserving partial bytes and network recovery status. Hardware
validation used the gallery route; a new Record/Stop cycle was not requested.
