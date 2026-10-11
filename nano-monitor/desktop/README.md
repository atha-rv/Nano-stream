# Nano Monitor desktop

Open **Nano Monitor** from the desktop shortcut or run `D:\Apps\Nano Monitor-win32-x64\Nano Monitor.exe`. The application lives on D:, including Chromium profile/cache and logs (`D:\NanoMonitor`). It bundles the existing React controls into local files and starts the camera bridge automatically. No Next.js server, browser tab, command prompt or manual server start is needed.

Storage defaults to **Automatic**: use a connected USB drive, otherwise `D:\Osmo Nano`. If several are present, the previously preferred USB is used when available, otherwise drive-letter order. **Always D:** and a specific USB are optional overrides in **Storage preference**. C: is never a footage destination. Detection refreshes in the background and before recording/copying. An active transfer stays on its original volume; removing it stops that copy and retains the camera original. Automatic fallback applies to the next transfer.

Power on the Nano nearby, attach the Vision Dock for any pairing approval, enable Bluetooth and Wi-Fi on the PC, and disconnect DJI Mimo. Click **Connect Nano**, approve on the dock if prompted, then wait for a live picture. Bluetooth handles discovery/pairing; the camera's Wi-Fi carries preview and files. Internet may pause until you disconnect. The full steps are visible in the app. Previous successful pairing is reused, but the app still checks the camera every connection. Turning it on alone is not a guarantee that Windows can connect.

Record on the camera and use **Stop & save**. Closing during recording offers **Stop, save & close** or **Keep recording**; normal closure waits for Wi-Fi restoration. A failed copy leaves the original on the Nano. Closing the app through Task Manager cannot guarantee cleanup.

Editing commands should use `../../tools/nano-transfer/edit_on_drive.py --source <video> -- <command...>` to keep working files, TEMP/TMP, media library and extracted-frame caches beside the footage. Existing PC recordings/caches are not moved or deleted. Old installed runtimes remain where they were.

This is a personal installation for **this PC**. The packaged desktop frontend still uses the workspace's existing isolated Python/OsmoOffload runtime and FFmpeg; do not remove the workspace or its ignored runtime. It is not a portable installer for another PC, has no auto-start or public hosting, and is not code-signed for distribution.

Build tools and download caches are on `D:\NanoMonitorBuild`. Versions are pinned in `package.json` and `package-lock.json`: Electron 44.7.0 (MIT), Electron Packager 20.3.0 (BSD-2-Clause), esbuild 0.28.2 (MIT). The built app includes the runtime's Chromium/Electron license files, MakerKit license and bundled renderer dependency notices. `renderer-dependencies.json` records actual bundled packages. A separate `npm audit` of the desktop toolchain reported zero known vulnerabilities on 2026-10-11; the existing web project's advisory record remains separate.

For a fresh checkout on D:, install the prerequisites in the repository README and run `../Setup-Desktop.ps1`. Setup fetches the pinned camera core, installs the locked Python/Node dependencies, and builds the app. It does not connect to the camera. The whole setup on a clean PC has not yet been tested; renderer rebuilding and local runtime tests have been checked on the development PC.

Build settings default to D: and can be changed with `NANO_BUILD_ROOT`, `NANO_TOOLCHAIN`, `NANO_OUTPUT_ROOT` and `NANO_DATA_ROOT`. Setup exposes corresponding PowerShell parameters. C: is rejected for large build/output/app-data directories. The footage fallback remains D: irrespective of build paths. Set `NANO_FFMPEG_DIRECTORY` to the installed FFmpeg folder. `node build.mjs --renderer-only` checks compilation without replacing the installed executable. A full build writes an ignored `desktop-install.json` so the launcher can find a custom output. It packages only the compiled local UI and small main/preload scripts. Existing output is replaced only when marked as a prior Nano Monitor build.

References:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/application-distribution
- https://github.com/electron/packager (exact 20.3.0 package and lockfile integrity retained)
- https://github.com/evanw/esbuild (exact 0.28.2 package and lockfile integrity retained)
