# Nano-stream

**See your DJI Osmo Nano's framing on a Windows laptop, record on the camera, and copy the original wirelessly after stopping.** Nano Monitor is the included Electron desktop app. It starts its local camera bridge automatically; you do not need to start a web server each time.

Experimental Windows camera integration, tested with one Osmo Nano. This project is independent of DJI.

## What works today

- Wireless framing preview, camera **Record** and **Stop & save** controls.
- Original-resolution video and audio copied after a recording stops. The preview is 1280×720, with no monitoring audio.
- **Download videos** opens the camera library and requests older pages. Select **Recorded today**, **Past 7 days**, **Last 5**, **Last 10**, **All**, or a custom date range; then tick/untick individual videos.
- Camera thumbnails appear beside each clip, loading as you browse without downloading originals. **Retry previews** reloads unavailable images. The memory cache is capped at 16 MB/128 previews; thumbnails do not create a footage cache on C:.
- **Automatic** storage preference: connected external USB drive first, otherwise `D:\Osmo Nano`. Optional **Always D:** or a specific USB override.
- Originals stored as `<destination>\Nano\<date>\video\`. Each download creates a chronological `batch.json` with recording dates, local paths, copy status and available duration/resolution metadata.
- Drive identity, available space and FAT32 size checks. Removing a drive interrupts its active transfer; fallback applies to the next transfer. Originals remain on the camera.
- Connection instructions, pairing approval feedback, stale-preview warnings and Wi-Fi restoration on normal disconnect.
- Editing helper to keep outputs, temporary files and supported media caches beside the selected footage.
- Standalone [editing foundation HTML](nano-monitor/design/editing-foundation.html) with six editable layout examples: white graphic cards, dark type, pink ticks/small accents, and white footage captions. Approve layouts/assets, check 16:9 and 9:16 previews, and save a personal copy on USB or D:.

The integrated daily YouTube/Reels editor is **planned**, not a current app feature. A landscape edit has been produced using separate local editing tools; this repository does not include personal videos or transcripts. See [the daily editing workflow](docs/DAILY-EDITING.md).

## Connect and record

1. Power on the Nano nearby. Attach its Vision Dock so you can approve pairing if prompted.
2. Enable **Bluetooth and Wi-Fi** on the PC. Disconnect DJI Mimo on the phone. Start from your normal Wi-Fi network so the app can restore it later.
3. Open **Nano Monitor**, choose the storage preference, and click **Connect Nano**.
4. Approve the connection on the dock if requested. Wait for the live picture before framing or recording.
5. Click **Record on Nano**, then **Stop & save**. Keep the app and destination drive connected until copying finishes.
6. Use **Disconnect** when done. The PC should return to its previous Wi-Fi network.

Bluetooth discovers and pairs the camera; the Nano's Wi-Fi carries preview and files. Windows Bluetooth pairing alone does not establish a live view. Turning on the camera is necessary, but connection still depends on its availability, adapters and any pairing approval. The PC's Wi-Fi adapter is occupied while connected, so internet may pause.

If the preview remains paused after copying, disconnect and reconnect. If the previous Wi-Fi cannot be restored, reconnect in Windows. A forced process kill or shutdown cannot perform cleanup.

## Build on Windows

This is a source checkout with a locally built desktop app, **not a portable installer or signed release**. Keep the checkout after building: the executable uses its pinned Python camera runtime. Setup does not install prerequisites or change drive formats.

Prerequisites:

- Windows with working Bluetooth/Wi-Fi adapters, an Osmo Nano and its Vision Dock.
- Git, Node.js **24.19.0 or later**, pnpm **11.19.0**, Python **3.13** available as `py -3.13`.
- FFmpeg and ffprobe on PATH. Install them separately; binaries are not included.
- D: or another non-C: drive for the source/runtime and build files. Automatic footage fallback specifically requires D:, or an external drive.

```powershell
git clone https://github.com/atha-rv/Nano-stream.git D:\Nano-stream
cd D:\Nano-stream
# Check prerequisites without downloads:
.\nano-monitor\Setup-Desktop.ps1 -CheckOnly
# Install locked dependencies and build the desktop app:
.\nano-monitor\Setup-Desktop.ps1
```

Then double-click `nano-monitor\Start Nano Monitor.cmd`. Defaults:

| Content | Location |
| --- | --- |
| Desktop executable | `D:\Apps\Nano Monitor-win32-x64\Nano Monitor.exe` |
| Chromium profile/cache and app logs | `D:\NanoMonitor` |
| Build tools, package stores and download caches | `D:\NanoMonitorBuild` |
| Camera engine, environment and private state | checkout's ignored `.research` directory |
| New original footage | external USB's `Osmo Nano` folder, otherwise `D:\Osmo Nano` |

Setup parameters `-BuildRoot`, `-OutputRoot` and `-DataRoot` support alternative non-C: locations. Those do not change the D: footage fallback. First-time setup on a clean second PC has **not** been verified. The renderer has been rebuilt and the runtime tests passed on the development PC.

For development details, see [desktop notes](nano-monitor/desktop/README.md). The retained Next.js interface is optional; its MakerKit foundation and lockfile remain for provenance. Supabase, billing and the starter's example screens are not used by the desktop camera workflow. `nano-monitor/SETUP.md` concerns that retained foundation, not desktop installation.

## Existing videos and editing storage

Open **Download videos** in Nano Monitor. If disconnected, use **Connect Nano & load videos**. Stop any recording first; browsing temporarily pauses the framing stream. Wait until the scan finishes before downloading. A warning means the loaded list may be incomplete; refresh to retry. Scans are bounded to 100 pages or four minutes and never silently claim completeness after a timeout/truncated response.

Quick filters select their matches. Untick unwanted clips, or **Clear selection** and tick a custom set. **Select all shown** adds the visible matches to your selection. Choosing another filter resets selection to its matches. Date filters use the filename's camera clock; **Past 7 days** includes today and the preceding six calendar days. Undated videos remain available under **All** and may appear at the end of Last 5/10 when fewer dated videos exist.

The footer shows the destination, new bytes to copy and files already there. Completed originals remain on the camera. Correct-size existing local files are included in the batch without downloading again; different-size/unknown-size conflicts are kept and excluded from selection. Move a damaged local file aside before retrying. **Cancel download** keeps completed files and resumable partials; select the same files to retry. No active transfer switches volumes after USB removal.

After copying, **Open batch folder** opens `<destination>\Nano\batches\<timestamp>\`. Give its `batch.json` and your approved foundation HTML to Codex with “Edit this dump for YouTube and Reels.” Dates are recording order, not proof of a coherent story or a confirmed timezone. Partial manifests distinguish usable completed files from failed/cancelled files.

The legacy `List-Videos.cmd` / `Download-New-Videos.cmd` launchers still query only the camera's newest returned page. Do not run them alongside an active monitor session.

To prepare a dump with optional cached local speech transcripts, see [daily editing](docs/DAILY-EDITING.md). This is a separate CLI helper, not an integrated AI editor.

Run editing tools through the included helper:

```powershell
.\.research\osmo-offload\.venv\Scripts\python.exe tools\nano-transfer\edit_on_drive.py --source 'E:\Osmo Nano\Nano\YYYY-MM-DD\video\example.MP4' -- your-editor-command
```

The source must be under the currently selected footage destination. Outputs belong in the source's `edit` folder. The helper redirects child-process TEMP/TMP, HyperFrames extracted frames, its media library and the general cache there. Apps, installed runtimes and model stores may have their own settings. Earlier footage/caches are not moved or deleted. USB must stay connected during an edit. Files of 4 GiB or larger cannot be copied onto FAT32; exFAT/NTFS support larger files.

## Verification and limits

On the development PC: BLE pairing, live preview, earlier Record/Stop original transfers, a measured 49.6 MB/s transfer, and normal Wi-Fi restoration were exercised. The Electron build received decoded preview frames. The gallery update loaded **48 videos across two real camera pages**, copied two selected 4K originals to USB, fully decoded both, created a complete chronological manifest, and restored Wi-Fi. The intake helper transcribed both with local word timings on that USB. Storage tests cover fallback, overrides, drive-letter changes, replacement/removal simulations, size/space failures and transfer pinning. Worker tests cover selection validation, resource cleanup and durable completed-file journals after simulated interruption.

Known limits: preview can pause after a copy; long sessions, libraries beyond the tested two pages, other firmware, physical unplugging during camera transfer, native close during recording and installation on another PC remain unverified. Completeness follows the camera's response and end markers; no independent camera inventory count is compared. Hashes are computed locally (BLAKE2b-128); no camera-provided checksum is compared. Desktop toolchain audit reported zero known advisories on 2026-10-11; one unpatched `braces` advisory remains in retained web/build tooling. See [audit](nano-monitor/research-audit.json), [gallery research](docs/GALLERY-RESEARCH.md) and [review evidence](nano-monitor/design-review.json).

Tests (after installing dependencies):

```powershell
node --test nano-monitor/desktop/bridge.test.cjs nano-monitor/apps/web/app/monitor/gallery-model.test.mjs nano-monitor/design/foundation.test.cjs
.\.research\osmo-offload\.venv\Scripts\python.exe -m pytest tools/nano-transfer/test_storage.py nano-monitor/camera/test_gallery.py nano-monitor/camera/test_server.py tools/nano-transfer/test_prepare_dump.py -q
node nano-monitor/desktop/build.mjs --renderer-only
```

## Reused projects and licenses

| Component | License | Pinned revision/version |
| --- | --- | --- |
| [OsmoOffload](https://github.com/intermittech/OsmoOffload) core | MIT | `9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f` |
| [OpenCine](https://github.com/erik-sutton95/OpenCine) framing/protocol adaptation | Apache-2.0 | `7f65d0ef8a6355b6ac652fb110dcaf79d454da2a` |
| [Osmosis](https://github.com/KonradIT/osmosis) pagination reference | MIT | `6992036abc29a01126a728443f1d29a83a7ef467` |
| [MakerKit Lite](https://github.com/makerkit/nextjs-saas-starter-kit-lite) UI/foundation | MIT | `c5cba64391a80620309c4178163dc2df42568d1b`, with recorded modifications |
| Electron / Electron Packager / esbuild | MIT / BSD-2-Clause / MIT | `44.7.0` / `20.3.0` / `0.28.2` |

MakerKit's license and OpenCine's license/notice are retained. Setup fetches OsmoOffload with its license. The renderer's dependency ledger and generated distribution notices cover actually bundled packages; Electron includes its Chromium notices. Python dependencies are recorded in `runtime-lock.txt`. FFmpeg's license depends on build options; the tested separately installed build enables GPL. Consult [FFmpeg's license guidance](https://www.ffmpeg.org/legal.html) before redistributing binaries.

Nano-stream's own code is MIT licensed. Dependencies and adapted files retain their respective licenses. Credentials, pairing state, personal footage, generated edits and runtime tokens are excluded from Git.
