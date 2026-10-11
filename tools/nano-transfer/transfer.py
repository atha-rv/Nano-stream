"""Copy original Nano videos through pinned OsmoOffload; no camera delete operations."""
import argparse
import asyncio
import json
import logging
import sys
import time
from pathlib import Path
from storage import storage, guard_downloads

ROOT = Path(__file__).resolve().parents[2] / ".research"
sys.path.insert(0, str(ROOT / "osmo-offload" / "src"))
from osmooffload import config
from osmooffload.ble import scanner
from osmooffload.ble.link import BleLink
from osmooffload.ble.pairing import pair_and_get_credentials
from osmooffload.core import connect
from osmooffload.camera.session import CameraDatalink
from osmooffload.core.offload import OffloadConfig, Offloader
from osmooffload.core.mp4meta import probe
from osmooffload.history import HistoryDB
from osmooffload.net.downloader import CameraHttp
from osmooffload.net import wifi


class PacedBleLink(BleLink):
    """Honor the Nano's documented gap between write-without-response frames."""
    def __init__(self, device):
        super().__init__(device)
        self.write_lock = asyncio.Lock()
        self.last_write = 0.0

    async def send(self, frame):
        async with self.write_lock:
            await asyncio.sleep(max(0, 0.12 - (time.monotonic() - self.last_write)))
            await super().send(frame)
            self.last_write = time.monotonic()


async def join_with_retry(profile):
    for attempt in range(2):
        try:
            await wifi.connect(profile, timeout=30)
            return
        except TimeoutError:
            if await wifi.is_associated(profile):
                return
            if attempt:
                raise
            print("Wi-Fi association is taking longer; retrying once...", flush=True)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["list", "one", "all"], default="list")
    parser.add_argument("--address")
    parser.add_argument("--destination", type=Path, help='Explicit override; otherwise use the monitor save location')
    args = parser.parse_args()
    destination = args.destination or (storage.check() if args.mode != 'list' else None)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    # Upstream logs complete DUML frames at INFO, including credential replies.
    logging.getLogger("osmo.ble").setLevel(logging.WARNING)
    state = config.load_state()
    candidates = [c for c in await scanner.scan(8) if c.model_id == 0x0019]
    if args.address:
        candidates = [c for c in candidates if c.address.lower() == args.address.lower()]
    if len(candidates) != 1:
        raise RuntimeError(f"Found {len(candidates)} matching Nanos; power on one nearby, or specify --address.")
    target = candidates[0]
    previous_profile = await wifi.current_profile()
    if not previous_profile:
        raise RuntimeError("Could not identify the current Wi-Fi profile to restore after transfer.")
    link = None
    dl = None
    db = None
    http = None
    try:
        print(f"Connecting to {target.name} (Osmo Nano).", flush=True)
        link = PacedBleLink(target.device)
        await link.connect()
        credentials = await pair_and_get_credentials(
            link, config.get_identifier(state),
            on_approval_needed=lambda: print("APPROVAL NEEDED: Tap Approve on the Nano's Vision Dock now.", flush=True),
        )
        config.remember_camera(state, target.address, model_id=target.model_id,
                               model_name=target.model_name, ssid=credentials.ssid,
                               password=credentials.password)
        print("Joining the Nano's Wi-Fi directly (Windows' network list may be cached)...", flush=True)
        await wifi.ensure_profile(credentials.ssid, credentials.password)
        await asyncio.sleep(3)
        await join_with_retry(credentials.ssid)
        await wifi.wait_for_ip("192.168.2.", timeout=20)

        def get_records():
            nonlocal dl
            dl = CameraDatalink(connect.CAMERA_IP, identifier=config.get_identifier(state))
            if not dl.open():
                raise RuntimeError("Camera datalink handshake failed.")
            dl.register()
            dl.enter_playback()
            records, raw = dl.query_newest_page()
            if not records:
                raise RuntimeError("No media records returned; camera may be empty or protocol needs investigation.")
            return records

        records = await asyncio.to_thread(get_records)
        videos = [record for record in records if record.is_video]
        print(f"Camera returned {len(records)} files, including {len(videos)} videos.", flush=True)
        if args.mode == "list":
            for record in videos:
                size_label = f"{record.size} bytes" if record.size else "size not reported"
                print(f"{record.name} ({size_label})", flush=True)
            return
        destination.mkdir(parents=True, exist_ok=True)
        db = HistoryDB(config.CONFIG_DIR / "nano-transfer-history.sqlite3")
        http = CameraHttp(connect.CAMERA_IP)
        if not args.destination:
            guard_downloads(http, destination)
        off = Offloader(OffloadConfig(base_dir=destination, camera_folder="Nano", kinds=("video",)), db, http)
        plan = await asyncio.to_thread(off.plan, videos)
        # Never overwrite a file already present, even when its length differs.
        for item in plan:
            if item.dest.exists():
                item.skipped = "destination already exists"
        pending = [item for item in plan if not item.skipped]
        pending.sort(key=lambda item: item.size or float("inf"))
        if args.mode == "one":
            pending = pending[:1]
            if pending and (not pending[0].size or pending[0].size > 250_000_000):
                raise RuntimeError("Smallest new video exceeds the 250 MB smoke-test limit. Record a short clip or use --mode all.")
        if not pending:
            print("No new videos to copy.", flush=True)
            return
        if not args.destination:
            storage.check([item.size for item in pending])
        previous_print = 0.0

        def progress(value):
            nonlocal previous_print
            now = time.monotonic()
            if now - previous_print >= 2:
                previous_print = now
                print(f"Copying {value.current_name}: {value.current_done / 1e6:.1f}/{value.current_total / 1e6:.1f} MB", flush=True)

        print(f"Copying {len(pending)} video(s) to {destination}.", flush=True)
        result = await asyncio.to_thread(off.run, pending, progress)
        for item in result.results:
            meta = probe(Path(item["dest_path"]))
            item["resolution"] = meta.resolution
            item["duration_seconds"] = meta.duration_s
        (ROOT / "nano-transfer-result.json").write_text(json.dumps({
            "copied": result.results, "failures": result.failures,
            "verification": "HTTP length plus locally computed receive hash; no source-side checksum comparison",
        }, indent=2), encoding="utf-8")
        print(f"Copied {result.done_files}/{result.total_files} videos.", flush=True)
        for item in result.results:
            print(f"SAVED: {item['dest_path']} ({item['resolution']}, {item['duration_seconds']} seconds)", flush=True)
        if result.failures:
            raise RuntimeError("; ".join(result.failures))
    finally:
        try:
            if http:
                http.close()
            if db:
                db.close()
            if dl:
                await asyncio.to_thread(dl.close)
            if link:
                await link.disconnect()
        finally:
            print("Restoring the previous Wi-Fi connection...", flush=True)
            await join_with_retry(previous_profile)
            print("Wi-Fi restored.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
