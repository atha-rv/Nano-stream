"""Read-only Nano pagination and chronological download-batch metadata.

Paging flow/end-marker interpretation adapted from MIT Osmosis CameraSession.kt:
https://github.com/KonradIT/osmosis/tree/6992036abc29a01126a728443f1d29a83a7ef467
Copyright (c) 2026 Konrad Iturbe. LICENSE-Osmosis is retained alongside this file.
Manifest decoding and file transfer continue to use pinned MIT OsmoOffload.
"""
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import time

PAGE_SIZE = 45
NEWEST = {0: 1, 1: 0x40000001}


class GalleryError(ValueError):
    pass


def recorded_at(name):
    match = re.search(r'(\d{14})', name)
    if match:
        try:
            return datetime.strptime(match.group(1), '%Y%m%d%H%M%S').isoformat()
        except ValueError:
            pass
    return None


def store_of(record):
    return record.storage if record.storage in (0, 1) else int(bool(record.handle & 0x40000000))


def record_id(record):
    return hashlib.sha256(f'{store_of(record)}:{record.media_path}'.encode()).hexdigest()[:24]


def safe_destination(record, destination):
    # Camera-provided filenames are untrusted. Nano files have no local separators.
    reserved = re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])', Path(record.name).stem, re.I)
    if not record.name or record.name in ('.', '..') or record.name != record.name.rstrip(' .') or reserved or Path(record.name).name != record.name or re.search(r'[<>:"/\\|?*\x00-\x1f]', record.name):
        raise GalleryError('The camera returned an unsafe filename.')
    date = (recorded_at(record.name) or 'undated')[:10]
    return Path(destination) / 'Nano' / date / 'video' / record.name


def entry(record, destination=None):
    item = {'id': record_id(record), 'name': record.name, 'size': record.size,
            'recordedAt': recorded_at(record.name), 'timestampSource': 'camera-filename',
            'storage': 'internal' if store_of(record) else 'sd', 'handle': record.handle,
            'alreadySaved': False, 'conflict': False}
    if destination:
        target = safe_destination(record, destination)
        try:
            if target.is_file():
                item['alreadySaved'] = bool(record.size and target.stat().st_size == record.size)
                item['conflict'] = not item['alreadySaved']
        except OSError:
            pass  # A disconnected drive does not invalidate the camera list.
    return item


def chronological(records):
    return sorted(records, key=lambda r: (recorded_at(r.name) is None, recorded_at(r.name) or '', r.handle, r.name))


@dataclass
class Slice:
    records: list
    declared: int = 0
    final: bool = False
    answered: bool = True
    ended: bool = True

    @property
    def incomplete(self):
        return 0 < self.declared <= PAGE_SIZE and len(self.records) < self.declared


@dataclass
class Page:
    slices: dict

    @property
    def records(self):
        seen = {}
        for section in self.slices.values():
            for record in section.records:
                seen[record_id(record)] = record
        return list(seen.values())


def walk_library(fetch_page, publish=lambda records, pages: None, cancelled=lambda: False,
                 max_pages=100, max_seconds=240):
    """Return records, completeness and warning; never call truncation an empty library."""
    cursors = dict(NEWEST)
    active = {0, 1}
    seen = {}
    deadline = time.monotonic() + max_seconds
    for number in range(1, max_pages + 1):
        if cancelled():
            return list(seen.values()), False, 'Library scan cancelled. These are the files loaded so far.'
        if time.monotonic() > deadline:
            return list(seen.values()), False, 'Library scan reached its time limit. Refresh to retry; the list may be incomplete.'
        try:
            page = fetch_page(dict(cursors))
            if any(page.slices.get(store, Slice([], answered=False)).incomplete for store in active):
                raise GalleryError('The camera list was cut short in transit. Refresh to retry.')
            if any(not page.slices.get(store, Slice([], answered=False)).answered for store in active):
                raise GalleryError('A camera storage query did not answer. The loaded list may be incomplete.')
        except (GalleryError, OSError, TimeoutError) as error:
            return list(seen.values()), False, str(error)
        before = len(seen)
        for record in page.records:
            seen[record_id(record)] = record
        publish(list(seen.values()), number)
        for store in list(active):
            section = page.slices[store]
            handles = [r.handle for r in section.records if r.handle and
                       (cursors[store] == NEWEST[store] or r.handle < cursors[store])]
            oldest = min(handles) if handles else None
            if section.final or (len(section.records) < PAGE_SIZE and section.ended):
                active.remove(store)
            elif oldest is None:
                return list(seen.values()), False, 'The camera repeated a page without an older cursor. The list may be incomplete.'
            else:
                cursors[store] = oldest
        if not active:
            return list(seen.values()), True, None
        if len(seen) == before:
            return list(seen.values()), False, 'The camera repeated a page. Refresh to retry older files.'
    return list(seen.values()), False, 'Library page limit reached. The list may be incomplete.'


def query_page(dl, cursors, cancelled=lambda: False):
    """Use the proven three-command flow with independently advancing store cursors."""
    from osmooffload.camera import manifest as mf
    from osmooffload.camera.session import list_cmd, LIST_TRIGGER
    blob = bytearray()
    trigger = internal = False
    started = time.monotonic()
    stable = 0
    last_count = -1
    with dl._io_lock:
        dl.tx.send_duml(0, 0x26, list_cmd(1, cursors[0]), receiver_type=1, receiver_id=0)
        while time.monotonic() - started < 10:
            if cancelled():
                raise GalleryError('Library scan cancelled. The loaded list may be incomplete.')
            got = dl.tx.recv_all(0.25)
            for packet in got:
                blob.extend(packet)
            dl._parse_status(got)
            dl.tx.send_ack()
            dl.presence_beat()
            age = time.monotonic() - started
            if age >= .8 and not trigger:
                dl.tx.send_duml(0, 0x26, LIST_TRIGGER, receiver_type=1, receiver_id=0)
                trigger = True
            if age >= 1.6 and not internal:
                dl.tx.send_duml(0, 0x26, list_cmd(2, cursors[1]), receiver_type=1, receiver_id=0)
                internal = True
            frames = list(mf.iter_frames(bytes(blob)))
            ends = {payload[4] for cs, ci, payload in frames if cs == 0 and ci == 0x27 and len(payload) >= 5 and payload[:2] == b'\x4a\x03'}
            count = len(mf.decode(mf.reassemble(bytes(blob))))
            stable = stable + 1 if count == last_count else 0
            last_count = count
            if age >= 2.5 and ends >= {1, 2}:
                break
            if age >= 4 and count and stable >= 6:
                break
        raw = bytes(blob)
        frames = list(mf.iter_frames(raw))
        slices = {}
        for store, counter in ((0, 1), (1, 2)):
            data = mf.reassemble(raw, request_ctr=counter)
            records = mf.decode(data) if data else []
            for record in records:
                record.storage = store
            replies = [payload for cs, ci, payload in frames if cs == 0 and ci == 0x27 and len(payload) >= 5 and payload[4] == counter]
            ended = any(payload[:2] == b'\x4a\x03' for payload in replies)
            # An opened empty Nano/dock storage stream is a camera answer too.
            empty_answer = bool(replies) and not data
            final = bool(re.search(rb'\x0c\x01\x0d[\x01-\xff]', data))
            slices[store] = Slice(records, mf.header_count(data), final, bool(replies), ended or empty_answer)
        if any(s.incomplete for s in slices.values()):
            raise GalleryError('The camera sent an incomplete page. Refresh the library to retry.')
        if slices[0].records and {r.media_path for r in slices[0].records} == {r.media_path for r in slices[1].records}:
            # Some bodies echo both queries as the same store. Qualify by handle bit.
            records = slices[1].records
            for record in records:
                record.storage = int(bool(record.handle & 0x40000000))
            slices = {store: Slice([r for r in records if r.storage == store],
                       final=slices[1].final, ended=slices[1].ended) for store in (0, 1)}
        if any(s.incomplete for s in slices.values()):
            raise GalleryError('The camera sent an incomplete page. Refresh the library to retry.')
        if not any(s.answered for s in slices.values()):
            raise GalleryError('The camera did not answer the library request. Reconnect and retry.')
        return Page(slices)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, path)


def make_batch(records, destination, label='Camera download'):
    moment = datetime.now().astimezone()
    identifier = moment.strftime('%Y-%m-%d_%H%M%S_%f')
    folder = Path(destination) / 'Nano' / 'batches' / identifier
    manifest = {'schemaVersion': 1, 'batchId': identifier, 'label': label,
                'createdAt': moment.isoformat(), 'mediaRoot': str(Path(destination).resolve()),
                'timestampSource': 'camera-filename', 'cameraTimezone': 'unspecified camera-local clock',
                'status': 'downloading', 'styleFoundation': 'Nano-stream editing foundation',
                'deliverables': ['YouTube landscape edit', 'Instagram vertical Reels'],
                'files': [{**entry(record), 'dest_path': str(safe_destination(record, destination)),
                           'status': 'queued', 'hash': None} for record in chronological(records)]}
    write_json(folder / 'batch.json', manifest)
    (folder / 'EDIT-THIS-DUMP.md').write_text(
        '# Edit this camera dump\n\n'
        'Use batch.json as the chronological source list. Produce a YouTube edit plus '
        'vertical Instagram Reels from the same footage. Follow the approved editing '
        'foundation: white Helvetica/Arial-style type, restrained motion, optional neon pink. '
        'Transcribe all usable files, read across them, and choose the strongest story; '
        'do not assume every clip belongs in the final cut. Preserve originals.\n\n'
        'Keep edit projects and media caches on this drive. Use prepare_dump.py to build '
        'a chronological intake and optional local word-timed transcripts.\n', encoding='utf-8')
    return folder / 'batch.json', manifest
