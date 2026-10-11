# Nano Monitor

This is the application source directory in [Nano-stream](https://github.com/atha-rv/Nano-stream). For fresh Windows setup, repository layout and the daily editing roadmap, start with the repository's root README. `SETUP.md` documents the retained SaaS foundation; Supabase and payment setup are unnecessary for this desktop camera tool.

The Windows desktop app is installed on D:. Open the **Nano Monitor** desktop shortcut or **Start Nano Monitor.cmd**. It starts its camera bridge automatically and loads compiled local controls; no web server needs to be started. See `desktop/README.md` for runtime dependencies and build details. The browser version is retained as an optional development interface.

**Storage preference** defaults to **Automatic**: connected external USB drive first, otherwise `D:\Osmo Nano`. Always D: or a specific USB are optional preferences. The transfer launcher uses the same setting. New originals are arranged as `<destination>\Nano\<date>\video\`. Volume identity is checked during copying; removing the active drive stops that transfer, while automatic fallback applies to the next one. C: is never used for footage. Existing recordings remain in their original locations; each saved row opens its own folder.

For editing, keep outputs in the source video's `edit` folder. Run media tools through `../tools/nano-transfer/edit_on_drive.py --source <video> -- <command...>`; this sets the working folder and redirects process TEMP/TMP, HyperFrames extracted frames, the media library and general cache onto that drive. `--print-env` returns those settings for a tool session. Applications, installed runtimes and small preferences stay on the PC. Earlier editing caches are not automatically removed or moved. Keep the USB connected throughout recording transfer and editing; safely eject when finished. FAT32 videos of 4 GiB or larger are refused before copying; exFAT/NTFS support larger files. No drive formatting is performed.

Local Windows browser tool for an Osmo Nano: wireless framing, camera Record/Stop, and automatic original-video transfer after Stop.

Power on the Nano with its Vision Dock, enable Bluetooth/Wi-Fi on this PC, disconnect DJI Mimo, and click **Connect Nano**. Approve pairing on the dock if asked and wait for the live picture. Choose **Record on Nano**, then **Stop & save**. Originals go to the selected save location, arranged by camera and date. **Disconnect** restores the previous Wi-Fi connection. The preview occupies the PC’s Wi-Fi adapter while connected; internet may be unavailable. These instructions are also shown in the app.

The preview is 1280×720 and has no monitoring audio. Camera originals retain their recording resolution and audio. This is local monitoring, without a public streaming service. Use the transfer launchers in `../tools/nano-transfer` to download existing videos.

## Verified on this PC

Nano discovered over BLE, authorized once on its dock, then joined over 5GHz Wi-Fi. The initial standalone preview received 355 complete frames in 12 seconds. The user ran Record/Stop in this interface and confirmed it works. Two originals were copied, including a 217,951,506-byte 3840×2160 HEVC original with stereo AAC (measured transfer 49.6 MB/s). The browser has also received 5,216 decoded preview frames. TypeScript checking passed. The phone layout was inspected with real filenames and 44–48px controls. This is an experimental camera integration; long sessions, large multi-file libraries, and interrupted transfer recovery have not been verified on hardware.

After a copy the preview can remain paused; the interface shows a stale-frame warning. Disconnect and reconnect to start a fresh preview. Recordings remain on the camera. No camera deletion is exposed.

## Runtime and provenance

Created with the workspace’s template `create:app` script; MakerKit’s MIT license, setup guidance, and regenerated pnpm lockfile are retained. Next.js and bundle-analyzer are 16.3.8. The camera bridge reuses the MIT OsmoOffload core at `9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f` in `../.research/osmo-offload`. BLE pacing and direct Windows Wi-Fi join are shared with `../tools/nano-transfer`. Live framing/ACK layout is adapted from Apache-2.0 OpenCine `7f65d0ef8a6355b6ac652fb110dcaf79d454da2a`; its license and notice are preserved in `camera/`.

- https://github.com/intermittech/OsmoOffload
- https://github.com/erik-sutton95/OpenCine
- https://github.com/KonradIT/osmosis (MIT protocol reference; no Android app shipped)

Bridge dependencies are pinned in `../tools/nano-transfer/runtime-lock.txt`. The existing isolated Python 3.13 environment and FFmpeg on PATH are required. This installation uses the desktop app’s bundled Node 24 runtime and pnpm-installed app dependencies. Camera credentials and session tokens stay in ignored `../.research/`; they are never sent to the browser. HTTP binds to loopback only, with a per-launch bridge token and same-origin action checks.

The dependency audit was rerun on 2026-10-11. Published fixes were applied for source-map-js, proxy-addr, postcss-selector-parser, fast-copy, tinypool and the MCP SDK. One unpatched braces advisory remains in build/component tooling; see `research-audit.json`. No public deployment or service-account configuration is claimed. Supabase authentication and billing are inapplicable to this personal loopback camera tool.
