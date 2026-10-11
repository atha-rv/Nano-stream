# Nano wireless transfer on this PC

Double-click **Download-New-Videos.cmd** to copy new original videos to
Nano Monitor's storage preference (Automatic: external USB, otherwise D:\Osmo Nano).
Override it under the monitor's Storage preference controls if desired.
Use **List-Videos.cmd** to see the returned video list.
Keep Bluetooth and Wi-Fi on, power the Nano on beside the PC, and disconnect
DJI Mimo first. Keep the Vision Dock attached for the first pairing approval.

The helper selects an advertised Nano, pairs over Bluetooth, joins its own
Wi-Fi, and copies files through the open-source OsmoOffload engine. It restores
the previous Wi-Fi profile in its cleanup path. Wi-Fi internet can pause while
copying. If restoration fails, reconnect to your normal network in Windows.

It contains no camera-delete operation, skips any existing destination filename,
and preserves upstream partial-download resume behavior. Existing filenames are
skipped even if their size differs; move that file aside before retrying a damaged
copy. Close the console only after restoration finishes. A forced process kill
or computer shutdown cannot run cleanup.

For a custom destination, open PowerShell here and run:

```powershell
.\Run-Transfer.ps1 -Mode all -Destination 'D:\Footage\Nano'
```

## Local implementation and verification

The CLI integration is in `transfer.py`. It deliberately uses a local Python
helper: the camera needs Windows Bluetooth, Wi-Fi switching and UDP access.
This is a tested local transfer utility, not a hosted web application.

The engine is the MIT-licensed
[OsmoOffload](https://github.com/intermittech/OsmoOffload) revision
`9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f` (v1.1.0), retained with its LICENSE
in `../../.research/osmo-offload`. Its PySide6 GUI dependency is not installed or
used; the transfer core uses the MIT-licensed Bleak and WinRT dependencies.
`runtime-lock.txt` records exact versions in the isolated Python 3.13 environment,
including the audit/test tools. No global Python packages were modified.

Our integration paces BLE writes by 120 ms and joins the camera Wi-Fi directly
instead of waiting for a cached Windows network list. The first upstream
bring-up attempt paired successfully but timed out waiting for network visibility.
Direct joining succeeded on this PC. This is observed behavior, not proof of
the precise Windows caching mechanism.

On 2026-10-11:

- Windows discovered a Nano over BLE and camera-side pairing was approved.
- The camera Wi-Fi associated over 5 GHz; the UDP datalink returned 45 records,
  including 20 videos.
- One original 16,712,514-byte MP4 was copied at a measured 45.6 MB/s. Its MP4
  metadata read 3840 x 2880 and 2.176 seconds. The previous Wi-Fi was restored.
  FFmpeg also decoded the complete video and audio without reporting errors.
- Transfer-core upstream tests: 31 passed, 1 skipped for absent real-clip
  fixtures, 1 excluded because the camera-delete GUI test requires PySide6.
- Installed-environment `pip-audit`: no known vulnerabilities after updating
  this environment's pip from 24.2 to 26.2.1. Recheck before distributing.

Copy verification checks HTTP length and records a locally computed receive
hash; it does not compare a checksum supplied by the camera. Full-library copy,
large-file interruptions, other firmware, empty cameras, and concurrent transfers
have not been tested. Do not run multiple instances together. The upstream list
method requests the newest page; completeness for very large libraries is not
proven. The phone/desktop web monitor is in `../../nano-monitor`; its evidence and limitations are recorded there.

Pairing credentials, history and the most recent result stay under the ignored
`.research` directory; do not publish its contents. Neither launcher starts with
Windows or installs a background service.

If this workspace's ignored runtime is removed, recreate the engine at the
exact revision above, run `py -3.13 -m venv .venv` in its directory, and install
the recorded packages with `.venv\Scripts\python -m pip install -r
..\..\tools\nano-transfer\runtime-lock.txt`. Preserve the upstream LICENSE.
