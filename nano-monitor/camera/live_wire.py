"""Nano hardware probe; stream framing adapted from Apache-2.0 OpenCine.

Upstream: https://github.com/erik-sutton95/OpenCine
Revision: 7f65d0ef8a6355b6ac652fb110dcaf79d454da2a
HevcDepacketizer.swift, Hevc.swift, DumlTransport.swift, Commands.swift.
Copyright 2026 Erik Sutton and OpenCine contributors.
License and NOTICE retained beside this file.
"""
import asyncio
import logging
import socket
import struct
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / ".research"
sys.path.insert(0, str(ROOT.parent / "tools" / "nano-transfer"))
from transfer import PacedBleLink, join_with_retry
from osmooffload import config
from osmooffload.ble import scanner
from osmooffload.ble.pairing import pair_and_get_credentials
from osmooffload.net import wifi
from osmooffload.net.datalink import DatalinkTransport, udp_header
from osmooffload.camera.session import CameraDatalink


class Assembler:
    def __init__(self):
        self.expected = None
        self.buffer = bytearray()
        self.last_seq = None
        self.dropped = 0

    def feed(self, packet):
        body = packet[20:]
        seq = int.from_bytes(packet[4:6], "little")
        if seq == self.last_seq:
            return None
        if body.startswith(b"\x00\x00\x01\xff") and len(body) >= 16:
            declared = int.from_bytes(body[4:8], "little")
            if self.expected is not None:
                self.dropped += 1
            self.expected = declared + 16 if 0 < declared <= 4 * 1024 * 1024 else None
            self.buffer.clear()
            self.last_seq = None
        if self.expected is None:
            return None
        if self.last_seq is not None and seq != (self.last_seq + 8) % 65536:
            self.dropped += 1
            self.expected = None
            self.buffer.clear()
            return None
        self.last_seq = seq
        if len(body) > self.expected - len(self.buffer):
            self.dropped += 1
            self.expected = None
            self.buffer.clear()
            return None
        self.buffer.extend(body)
        if len(self.buffer) != self.expected:
            return None
        au = bytes(self.buffer[16:])
        self.expected = None
        self.buffer.clear()
        # Remove Nano's exact 32-byte private AVC metadata block before decoding.
        pos = 0
        while True:
            pos = au.find(b"\x00\x00\x01\x06\xf0\x19", pos)
            if pos < 0:
                break
            if pos + 32 <= len(au) and au[pos + 31] == 0x80:
                au = au[:pos] + au[pos + 32:]
            else:
                pos += 6
        return au


class LiveTransport(DatalinkTransport):
    def __init__(self, on_video):
        super().__init__("192.168.2.1", 9004)
        self.on_video = on_video
        self.video_seq = None
        self.reliable_seq = None
        self.extra_seq = None

    def recv_all(self, duration):
        self._sock.settimeout(0.005)
        out = []
        deadline = time.monotonic() + duration
        while time.monotonic() < deadline:
            try:
                packet = self._sock.recv(65536)
            except socket.timeout:
                continue
            except OSError:
                break
            if len(packet) < 8:
                continue
            kind = packet[6]
            candidate = None
            if kind == 2:
                self.video_seq = int.from_bytes(packet[4:6], "little")
                self.on_video(packet)
            else:
                out.append(packet)
            if kind == 1 and len(packet) == 34:
                self.cam_channel = int.from_bytes(packet[8:10], "little")
                if self.video_seq is None:
                    self._peer_cursor = int.from_bytes(packet[10:12], "little")
                candidate = int.from_bytes(packet[18:20], "little")
                self.extra_seq = int.from_bytes(packet[26:28], "little")
            elif kind == 3:
                candidate = int.from_bytes(packet[4:6], "little")
            if candidate is not None and (self.reliable_seq is None or
                (candidate - self.reliable_seq) % 65536 < 32768):
                self.reliable_seq = candidate
        return out

    def send_ack(self):
        def group(value):
            return struct.pack("<HHI", value, value, 0)
        video = self.video_seq if self.video_seq is not None else self._peer_cursor
        reliable = self.reliable_seq if self.reliable_seq is not None else self.base_seq
        extra = self.extra_seq if self.extra_seq is not None else self.base_seq
        payload = group(video) + group(reliable) + group(extra) + b"\0\0"
        self._send(udp_header(4, len(payload), self.session_id, 0) + payload)


def receive_preview(identifier):
    assembler = Assembler()
    frame_count = 0
    output = ROOT / "nano-live-test.h264"
    with output.open("wb") as stream:
        def on_video(packet):
            nonlocal frame_count
            au = assembler.feed(packet)
            if au:
                frame_count += 1
                stream.write(au)
        dl = CameraDatalink("192.168.2.1", identifier=identifier)
        dl.tx = LiveTransport(on_video)
        try:
            if not dl.open():
                raise RuntimeError("Live datalink did not open")
            dl.register()
            dl.tx.send_duml(2, 0x0C, bytes.fromhex("01010000"), receiver_type=1, receiver_id=0)
            dl._drain(0.2)
            dl.tx.send_duml(2, 9, bytes(10) + b"\x03", receiver_type=1, receiver_id=0)
            dl._drain(0.15)
            dl.tx.send_duml(9, 0xA8, bytes.fromhex("00040200000000000000"), receiver_type=1, receiver_id=2)
            print("Receiving live preview for 12 seconds...", flush=True)
            deadline = time.monotonic() + 12
            last_presence = 0
            while time.monotonic() < deadline:
                dl._parse_status(dl.tx.recv_all(0.02))
                dl.tx.send_ack()
                if time.monotonic() - last_presence > 1:
                    last_presence = time.monotonic()
                    dl.presence_beat()
            print(f"LIVE RESULT: {frame_count} complete frames, {assembler.dropped} incomplete frames dropped; {output.stat().st_size} bytes", flush=True)
        finally:
            dl.tx.send_duml(2, 9, bytes(10) + b"\x04", receiver_type=1, receiver_id=0)
            dl.close()
    if not frame_count:
        raise RuntimeError("No live frames received")


async def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    logging.getLogger("osmo.ble").setLevel(logging.WARNING)
    cameras = [c for c in await scanner.scan(8) if c.model_id == 0x19]
    if len(cameras) != 1:
        raise RuntimeError("Power on one Nano nearby")
    previous = await wifi.current_profile()
    if not previous:
        raise RuntimeError("Cannot identify the Wi-Fi profile to restore")
    state = config.load_state()
    link = PacedBleLink(cameras[0].device)
    try:
        await link.connect()
        credentials = await pair_and_get_credentials(link, config.get_identifier(state))
        await wifi.ensure_profile(credentials.ssid, credentials.password)
        await asyncio.sleep(3)
        await join_with_retry(credentials.ssid)
        await wifi.wait_for_ip("192.168.2.", timeout=20)
        await asyncio.to_thread(receive_preview, config.get_identifier(state))
    finally:
        try:
            await link.disconnect()
        finally:
            print("Restoring Wi-Fi...", flush=True)
            await join_with_retry(previous)
            print("Wi-Fi restored.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
