"""Bounded, session-scoped camera thumbnails; never fetch original videos.

.scr/.thm addressing follows MIT Osmosis ImageLoader.kt at revision
6992036abc29a01126a728443f1d29a83a7ef467; see LICENSE-Osmosis.
"""
from collections import OrderedDict
import http.client
from pathlib import PurePosixPath
import threading
import time
from urllib.parse import quote

LIMIT = 512 * 1024


def thumbnail_paths(record):
    path = getattr(record, 'thumb_path', None)
    if not path:
        media = record.media_path
        if not media.startswith('DCIM/'):
            return []
        path = 'MISC/THM/' + str(PurePosixPath(media[5:]).with_suffix(''))
    if len(path) > 1024 or not path.startswith('MISC/THM/') or any(p in ('', '.', '..') for p in path.split('/')) or any(c in path for c in '\\?\x00\r\n'):
        return []
    suffix = PurePosixPath(path).suffix.lower()
    if suffix in ('.scr', '.thm'):
        path = path[:-4]
    elif suffix:
        return []
    return [path + '.scr', path + '.thm']


def fetch_thumbnail(record):
    # One connection per image task; CameraHttp's shared connection isn't thread safe.
    deadline = time.monotonic() + 5
    for storage in dict.fromkeys((record.storage, 1, 0)):
        if storage not in (0, 1):
            continue
        for path in thumbnail_paths(record):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            conn = http.client.HTTPConnection('192.168.2.1', timeout=min(1.5, remaining))
            try:
                conn.request('GET', f'/v2?storage={storage}&path={quote(path, safe="/")}')
                response = conn.getresponse()
                if response.status != 200:
                    continue
                data = response.read(LIMIT + 1)
                if 4 <= len(data) <= LIMIT and data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9'):
                    return data
            except (OSError, http.client.HTTPException):
                pass
            finally:
                conn.close()
    return None


class ThumbnailCache:
    def __init__(self, fetch=fetch_thumbnail, budget=16 * 1024 * 1024, entries=128):
        self.fetch, self.budget, self.entries = fetch, budget, entries
        self.lock = threading.RLock()
        self.pool = threading.BoundedSemaphore(2)
        self.values = OrderedDict()
        self.size = 0
        self.generation = 0

    def clear(self):
        with self.lock:
            self.generation += 1
            self.values.clear()
            self.size = 0

    def get(self, key, record, generation, online=True, retry=False):
        with self.pool:
            with self.lock:
                if generation != self.generation:
                    return None
                cached = self.values.get(key)
                if cached and (cached[0] is not None or (not retry and time.monotonic() - cached[1] < 10)):
                    self.values.move_to_end(key)
                    return cached[0]
            if not online:
                return None
            data = self.fetch(record)
            with self.lock:
                if generation != self.generation:
                    return None  # An old camera request must not populate a new session.
                previous = self.values.pop(key, None)
                self.size -= len(previous[0] or b'') if previous else 0
                self.values[key] = (data, time.monotonic())
                self.size += len(data or b'')
                while self.size > self.budget or len(self.values) > self.entries:
                    _, removed = self.values.popitem(last=False)
                    self.size -= len(removed[0] or b'')
            return data
