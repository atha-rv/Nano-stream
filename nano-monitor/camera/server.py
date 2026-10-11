"""Loopback camera bridge. Camera actions stay in one worker, outside the browser."""
import asyncio
import json
import logging
import os
import queue
import secrets
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from live_wire import Assembler, LiveTransport
from transfer import PacedBleLink, join_with_retry
from storage import storage, guard_downloads
from osmooffload import config
from osmooffload.ble import scanner
from osmooffload.ble.pairing import pair_and_get_credentials
from osmooffload.camera.session import CameraDatalink
from osmooffload.core.offload import OffloadConfig, Offloader
from osmooffload.core.mp4meta import probe
from osmooffload.history import HistoryDB
from osmooffload.net import wifi
from osmooffload.net.downloader import CameraHttp

WORKSPACE = Path(__file__).resolve().parents[2]
SESSION_FILE = WORKSPACE / ".research" / "nano-bridge-session.json"
TOKEN = secrets.token_urlsafe(32)
PORT = 8765


class Monitor:
    def __init__(self):
        self.lock = threading.RLock()
        self.frames = threading.Condition(self.lock)
        self.jpeg = None
        self.jpeg_time = 0
        self.commands = queue.Queue()
        self.worker = None
        self.decoder = None
        self.feed = queue.Queue(maxsize=50)
        self.stop_decoder = threading.Event()
        self.state = {"phase": "disconnected", "message": "Power on your Nano, then connect.",
                      "recording": False, "battery": None, "saved": [], "error": None,
                      "destination": storage.status()['destination'], "progress": None, "frames": 0}
        try:
            storage.refresh()
        except ValueError:
            pass  # USB discovery can be retried from the visible Refresh control.
        def watch_storage():
            while True:
                time.sleep(10)
                try:
                    storage.refresh()
                except ValueError:
                    pass
        threading.Thread(target=watch_storage, daemon=True).start()

    def update(self, **fields):
        with self.lock:
            self.state.update(fields)

    def snapshot(self):
        with self.lock:
            location = storage.status()
            return {**self.state, "storage": location, "destination": location['destination'],
                    "previewAge": time.monotonic() - self.jpeg_time if self.jpeg_time else None}

    def choose_storage(self, volume_id):
        with self.lock:
            if self.worker and self.worker.is_alive():
                raise ValueError('Disconnect the camera before changing the save location.')
            storage.choose(volume_id)
            self.state.update(message='Save location updated. New recordings will go here.', error=None)

    def action(self, action):
        with self.lock:
            phase = self.state["phase"]
            if action == 'close':
                if not self.worker or not self.worker.is_alive():
                    return
                if phase in ('connecting', 'pending', 'saving', 'disconnecting'):
                    raise ValueError('Wait for the current camera action to finish before closing.')
                self.state.update(phase='pending', message='Saving and disconnecting before closing…')
                self.commands.put('close')
                return
            if action == "connect":
                if self.worker and self.worker.is_alive():
                    raise ValueError("A camera session is already running.")
                self.commands = queue.Queue()
                self.jpeg = None
                self.jpeg_time = 0
                self.state.update(phase="connecting", message="Looking for your Nano…", error=None, frames=0)
                self.worker = threading.Thread(target=lambda: asyncio.run(self.session()), daemon=True)
                self.worker.start()
                return
            if phase not in ("live", "recording", "preview_unavailable"):
                raise ValueError("Wait until the camera is connected and ready.")
            if action == "start" and self.state["recording"]:
                raise ValueError("The camera is already recording.")
            if action == "start":
                storage.check()
            if action == "stop" and not self.state["recording"]:
                raise ValueError("The camera is not recording.")
            if action == "disconnect" and self.state["recording"]:
                raise ValueError("Stop recording before disconnecting.")
            self.state.update(phase="pending", message={"start": "Starting recording…", "stop": "Stopping and saving…", "disconnect": "Disconnecting…"}[action])
            self.commands.put(action)

    def start_decoder(self):
        executable = shutil.which("ffmpeg")
        if not executable:
            raise RuntimeError("FFmpeg was not found on this PC.")
        self.stop_decoder = threading.Event()
        self.feed = queue.Queue(maxsize=50)
        self.decoder = subprocess.Popen([executable, "-loglevel", "error", "-probesize", "32",
            "-analyzeduration", "0", "-f", "h264", "-r", "25", "-i", "pipe:0", "-an",
            "-vf", "fps=15", "-threads", "2", "-f", "image2pipe", "-c:v", "mjpeg",
            "-q:v", "4", "-flush_packets", "1", "pipe:1"], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        decoder, stop, feed = self.decoder, self.stop_decoder, self.feed

        def write_feed():
            while not stop.is_set():
                try:
                    au = feed.get(timeout=0.2)
                    decoder.stdin.write(au)
                    decoder.stdin.flush()
                except queue.Empty:
                    continue
                except (BrokenPipeError, OSError, ValueError):
                    return

        def read_frames():
            buffer = bytearray()
            while not stop.is_set():
                chunk = decoder.stdout.read1(65536)
                if not chunk:
                    return
                buffer.extend(chunk)
                while True:
                    start = buffer.find(b"\xff\xd8")
                    end = buffer.find(b"\xff\xd9", max(start, 0) + 2)
                    if start < 0 or end < 0:
                        break
                    with self.frames:
                        self.jpeg = bytes(buffer[start:end + 2])
                        self.jpeg_time = time.monotonic()
                        self.state["frames"] += 1
                        self.frames.notify_all()
                    del buffer[:end + 2]
                if len(buffer) > 5 * 1024 * 1024:
                    buffer.clear()
        threading.Thread(target=write_feed, daemon=True).start()
        threading.Thread(target=read_frames, daemon=True).start()

    def on_video(self, packet):
        au = self.assembler.feed(packet)
        if au:
            try:
                self.feed.put_nowait(au)
            except queue.Full:
                # Bound decoder pressure. A following keyframe restores decode.
                pass

    def enable_preview(self, dl):
        dl.tx.send_duml(2, 0x0C, bytes.fromhex("01010000"), receiver_type=1, receiver_id=0)
        dl._drain(0.2)
        dl.tx.send_duml(2, 9, bytes(10) + b"\x03", receiver_type=1, receiver_id=0)
        dl._drain(0.15)
        dl.tx.send_duml(9, 0xA8, bytes.fromhex("00040200000000000000"), receiver_type=1, receiver_id=2)

    def wait_recording(self, dl, wanted):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            dl._parse_status(dl.tx.recv_all(0.025))
            dl.tx.send_ack()
            if dl.status.recording == wanted:
                return
        raise RuntimeError("The camera did not confirm its recording state. Check the Vision Dock.")

    def pump(self, identifier, credentials):
        self.assembler = Assembler()
        dl = CameraDatalink("192.168.2.1", identifier=identifier)
        dl.tx = LiveTransport(self.on_video)
        db = None
        http = None
        app_recording = False
        try:
            self.start_decoder()
            if not dl.open():
                raise RuntimeError("The camera did not complete its wireless handshake.")
            dl.register()
            baseline, _ = dl.query_newest_page()
            known = {item.media_path for item in baseline}
            self.enable_preview(dl)
            self.update(phase="live", message="Connected. Frame your shot, then record.")
            last_presence = 0
            last_preview_repair = time.monotonic()
            while True:
                dl._parse_status(dl.tx.recv_all(0.02))
                dl.tx.send_ack()
                now = time.monotonic()
                if now - last_presence >= 1:
                    last_presence = now
                    dl.presence_beat()
                    self.update(battery=dl.status.battery_pct, recording=dl.status.recording)
                    if self.state["phase"] in ("live", "recording"):
                        self.update(phase="recording" if dl.status.recording else "live")
                if now - self.jpeg_time > 8 and now - last_preview_repair > 12:
                    self.enable_preview(dl)
                    last_preview_repair = now
                    self.update(message="Waiting for a live picture; reconnect if it stays blank.")
                try:
                    action = self.commands.get_nowait()
                except queue.Empty:
                    continue
                if action == "disconnect" or (action == 'close' and not dl.status.recording):
                    break
                if action == "start":
                    reply = dl.run_command(2, 2, b"\x01")
                    if reply != b"\x00":
                        raise RuntimeError("The Nano refused Record. Check its mode and free storage.")
                    self.wait_recording(dl, True)
                    app_recording = True
                    self.update(phase="recording", recording=True, message="Recording on the Nano. Stop to save the original here.")
                elif action in ("stop", "close"):
                    reply = dl.run_command(2, 2, b"\x00")
                    if reply != b"\x00":
                        raise RuntimeError("The Nano did not accept Stop. Check its screen.")
                    self.wait_recording(dl, False)
                    app_recording = False
                    self.update(phase="saving", recording=False, message="Copying the original to your selected save location…")
                    time.sleep(1.5)
                    dl.enter_playback()
                    records, _ = dl.query_newest_page()
                    new = [record for record in records if record.is_video and record.media_path not in known]
                    if not new:
                        raise RuntimeError("Recording stopped, but the new file was not listed. It remains on the camera; use Download New Videos to retry.")
                    db = HistoryDB(config.CONFIG_DIR / "nano-transfer-history.sqlite3")
                    destination = storage.check([record.size for record in new])
                    http = CameraHttp("192.168.2.1")
                    guard_downloads(http, destination)
                    off = Offloader(OffloadConfig(base_dir=destination, camera_folder="Nano", kinds=("video",)), db, http)
                    off.on_network_lost = lambda: wifi.rejoin_sync(credentials.ssid)
                    plan = off.plan(new)
                    for item in plan:
                        if item.dest.exists():
                            item.skipped = "destination already exists"
                    def progress(value):
                        self.update(progress=round(100 * (value.done_bytes + value.current_done) / max(value.total_bytes, 1)))
                    result = off.run(plan, progress)
                    if result.failures:
                        raise RuntimeError("Some recordings could not be copied. They remain on the camera; retry the transfer launcher.")
                    with self.lock:
                        self.state["saved"] = list(reversed(result.results)) + self.state["saved"]
                        (WORKSPACE / ".research" / "nano-monitor-saved.json").write_text(json.dumps(self.state["saved"], indent=2), encoding="utf-8")
                    known.update(record.media_path for record in records)
                    db.close(); db = None
                    http.close(); http = None
                    self.enable_preview(dl)
                    self.update(phase="live", message="Original saved to your selected location. Ready for another take.", progress=None)
                    if action == 'close':
                        break
        finally:
            try:
                if app_recording:
                    dl.run_command(2, 2, b"\x00")
                dl.tx.send_duml(2, 9, bytes(10) + b"\x04", receiver_type=1, receiver_id=0)
            finally:
                if db:
                    db.close()
                if http:
                    http.close()
                try:
                    dl.close()
                finally:
                    self.stop_decoder.set()
                    if self.decoder:
                        self.decoder.terminate()
                        self.decoder.wait(timeout=5)
                    self.update(recording=False)

    async def session(self):
        link = None
        previous = None
        failure = None
        try:
            cameras = [c for c in await scanner.scan(8) if c.model_id == 0x19]
            if len(cameras) != 1:
                raise RuntimeError("Keep one Nano powered on nearby, with DJI Mimo disconnected, then try again.")
            previous = await wifi.current_profile()
            if not previous:
                raise RuntimeError("Cannot identify the current Wi-Fi connection to restore later.")
            state = config.load_state()
            link = PacedBleLink(cameras[0].device)
            await link.connect()
            self.update(message="Pairing with your Nano…")
            credentials = await pair_and_get_credentials(link, config.get_identifier(state),
                on_approval_needed=lambda: self.update(message="Tap Approve on the Nano's Vision Dock."))
            self.update(message="Joining the Nano’s Wi-Fi…")
            await wifi.ensure_profile(credentials.ssid, credentials.password)
            await asyncio.sleep(3)
            await join_with_retry(credentials.ssid)
            await wifi.wait_for_ip("192.168.2.", timeout=20)
            await asyncio.to_thread(self.pump, config.get_identifier(state), credentials)
        except Exception as error:
            failure = str(error)
            logging.exception("Camera session ended")
        finally:
            self.update(phase="disconnecting", message="Restoring your Wi-Fi connection…")
            try:
                if link:
                    await link.disconnect()
            finally:
                try:
                    if previous:
                        await join_with_retry(previous)
                except Exception:
                    failure = (failure or "Camera disconnected.") + " Reconnect to your normal Wi-Fi in Windows."
            self.update(phase="error" if failure else "disconnected", error=failure,
                        message=failure or "Disconnected. Your normal Wi-Fi is restored.", recording=False)


monitor = Monitor()
saved_path = WORKSPACE / ".research" / "nano-monitor-saved.json"
if saved_path.exists():
    monitor.state["saved"] = json.loads(saved_path.read_text(encoding="utf-8"))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def authorized(self):
        return self.headers.get("Host") in (f"127.0.0.1:{PORT}", f"localhost:{PORT}") and secrets.compare_digest(self.headers.get("X-Nano-Token", ""), TOKEN)

    def reply(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.authorized():
            self.reply({"error": "Unauthorized local bridge request."}, 403)
            return
        route = urlsplit(self.path).path
        if route == "/state":
            self.reply(monitor.snapshot())
        elif route == "/storage":
            try:
                storage.refresh()
                self.reply(monitor.snapshot())
            except ValueError as error:
                self.reply({'error': str(error)}, 409)
        elif route == "/preview":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=nano")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            last = 0
            try:
                while True:
                    with monitor.frames:
                        monitor.frames.wait_for(lambda: monitor.jpeg_time != last, timeout=2)
                        frame, last = monitor.jpeg, monitor.jpeg_time
                        phase = monitor.state["phase"]
                    if frame:
                        self.wfile.write(b"--nano\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n")
                        self.wfile.flush()
                    if phase in ("disconnected", "error"):
                        return
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            self.reply({"error": "Not found"}, 404)

    def do_POST(self):
        if not self.authorized():
            self.reply({"error": "Unauthorized local bridge request."}, 403)
            return
        action = self.path.lstrip("/")
        if action not in ("connect", "start", "stop", "disconnect", "folder", "storage", "close"):
            self.reply({"error": "Unknown action"}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 4096:
                raise ValueError('Request is too large.')
            body = json.loads(self.rfile.read(length)) if length else {}
            if not isinstance(body, dict):
                raise ValueError('Expected a JSON object.')
            if action == "folder":
                if 'savedPath' in body:
                    match = next((item for item in monitor.snapshot()['saved'] if item['dest_path'] == body['savedPath']), None)
                    if not match:
                        raise ValueError('That recording is not in the saved list.')
                    destination = Path(match['dest_path']).parent
                    if not destination.is_dir():
                        raise ValueError('This recording folder is unavailable. Reconnect its drive.')
                else:
                    destination = storage.check()
                subprocess.Popen(["explorer.exe", str(destination)], creationflags=0x08000000)
            elif action == "storage":
                monitor.choose_storage(body.get('id'))
            else:
                monitor.action(action)
            self.reply(monitor.snapshot(), 202)
        except (ValueError, OSError) as error:
            self.reply({"error": str(error)}, 409)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("osmo.ble").setLevel(logging.WARNING)
    SESSION_FILE.write_text(json.dumps({"port": PORT, "token": TOKEN}), encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"Nano bridge listening locally on 127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
