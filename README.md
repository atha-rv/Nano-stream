# Nano-stream

**See your DJI Osmo Nano's framing on a Windows laptop, record on the camera, and copy the original wirelessly after stopping.** Nano Monitor is the included Electron desktop app. It starts its local camera bridge automatically; you do not need to start a web server each time.

Experimental Windows camera integration, tested with one Osmo Nano. This project is independent of DJI.

## What works today

- Wireless framing preview, camera **Record** and **Stop & save** controls.
- Original-resolution video and audio copied after a recording stops. The preview is 1280×720, with no monitoring audio.
- **Automatic** storage preference: connected external USB drive first, otherwise `D:\Osmo Nano`. Optional **Always D:** or a specific USB override.
- Originals stored as `<destination>\Nano\<date>\video\`. Existing camera recordings can also be copied with the transfer launcher.
- Drive identity, available space and FAT32 size checks. Removing a drive interrupts its active transfer; fallback applies to the next transfer. Originals remain on the camera.
- Connection instructions, pairing approval feedback, stale-preview warnings and Wi-Fi restoration on normal disconnect.
- Editing helper to keep outputs, temporary files and supported media caches beside the selected footage.

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

Use `tools\nano-transfer\List-Videos.cmd` to list the camera's returned page and `Download-New-Videos.cmd` to copy new originals, with the same storage preference. Do not run this alongside an active monitor connection. Existing destination filenames are skipped, even if damaged; move a damaged local file aside before retrying.

Run editing tools through the included helper:

```powershell
.\.research\osmo-offload\.venv\Scripts\python.exe tools\nano-transfer\edit_on_drive.py --source 'E:\Osmo Nano\Nano\YYYY-MM-DD\video\example.MP4' -- your-editor-command
```

The source must be under the currently selected footage destination. Outputs belong in the source's `edit` folder. The helper redirects child-process TEMP/TMP, HyperFrames extracted frames, its media library and the general cache there. Apps, installed runtimes and model stores may have their own settings. Earlier footage/caches are not moved or deleted. USB must stay connected during an edit. Files of 4 GiB or larger cannot be copied onto FAT32; exFAT/NTFS support larger files.

## Verification and limits

On the development PC: BLE pairing, live preview, two Record/Stop original transfers, a measured 49.6 MB/s transfer, and normal Wi-Fi restoration were exercised. The Electron build received decoded preview frames. Storage tests cover fallback, overrides, drive-letter changes, replacement/removal simulations, size/space failures and transfer pinning. A real USB HTTP fixture verified content/hash and cache placement.

Known limits: preview can pause after a copy; long sessions, full large libraries, other firmware, physical unplugging during camera transfer, native close during recording and installation on another PC remain unverified. The camera list currently uses its newest returned page, so full-library completeness is not established. Hashes are computed locally; no camera-provided checksum is compared. Desktop toolchain audit reported zero known advisories on 2026-10-11; one unpatched `braces` advisory remains in retained web/build tooling. See [audit](nano-monitor/research-audit.json) and [review evidence](nano-monitor/design-review.json).

Tests (after installing dependencies):

```powershell
node --test nano-monitor/desktop/bridge.test.cjs
.\.research\osmo-offload\.venv\Scripts\python.exe -m pytest tools/nano-transfer/test_storage.py -q
node nano-monitor/desktop/build.mjs --renderer-only
```

## Reused projects and licenses

| Component | License | Pinned revision/version |
| --- | --- | --- |
| [OsmoOffload](https://github.com/intermittech/OsmoOffload) core | MIT | `9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f` |
| [OpenCine](https://github.com/erik-sutton95/OpenCine) framing/protocol adaptation | Apache-2.0 | `7f65d0ef8a6355b6ac652fb110dcaf79d454da2a` |
| [MakerKit Lite](https://github.com/makerkit/nextjs-saas-starter-kit-lite) UI/foundation | MIT | `c5cba64391a80620309c4178163dc2df42568d1b`, with recorded modifications |
| Electron / Electron Packager / esbuild | MIT / BSD-2-Clause / MIT | `44.7.0` / `20.3.0` / `0.28.2` |

MakerKit's license and OpenCine's license/notice are retained. Setup fetches OsmoOffload with its license. The renderer's dependency ledger and generated distribution notices cover actually bundled packages; Electron includes its Chromium notices. Python dependencies are recorded in `runtime-lock.txt`. FFmpeg's license depends on build options; the tested separately installed build enables GPL. Consult [FFmpeg's license guidance](https://www.ffmpeg.org/legal.html) before redistributing binaries.

Nano-stream's own code is MIT licensed. Dependencies and adapted files retain their respective licenses. Credentials, pairing state, personal footage, generated edits and runtime tokens are excluded from Git.
