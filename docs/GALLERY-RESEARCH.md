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
for filename/date/size selection. Thumbnail playback is outside this change.
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
