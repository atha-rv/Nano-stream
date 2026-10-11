from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import threading
import thumbnails


def clip(path='MISC/THM/DJI_001/DJI_20261011120000_0001_D', storage=1):
    return SimpleNamespace(thumb_path=path, storage=storage,
                          media_path='DCIM/DJI_001/DJI_20261011120000_0001_D.MP4')


def test_only_small_sidecars_are_addressed():
    expected = ['MISC/THM/DJI_001/DJI_20261011120000_0001_D.scr',
                'MISC/THM/DJI_001/DJI_20261011120000_0001_D.thm']
    assert thumbnails.thumbnail_paths(clip()) == expected
    assert thumbnails.thumbnail_paths(clip(None)) == expected
    assert thumbnails.thumbnail_paths(clip(expected[1])) == expected
    for path in ['DCIM/video.MP4', 'MISC/THM/../../video', 'MISC/THM/x?path=DCIM/x', 'MISC/THM/x\\y', 'MISC/THM/x.mp4']:
        assert thumbnails.thumbnail_paths(clip(path)) == []


def test_http_caps_bytes_rejects_non_images_and_falls_back(monkeypatch):
    calls, closed = [], []
    jpeg = b'\xff\xd8\xff\xe0camera\xff\xd9'
    class Connection:
        def __init__(self, host, timeout):
            assert host == '192.168.2.1'
        def request(self, method, url):
            calls.append(url)
            assert method == 'GET' and 'path=MISC/THM/' in url
        def getresponse(self):
            data = jpeg if 'storage=0' in calls[-1] and calls[-1].endswith('.thm') else b'not an image'
            def read(limit):
                assert limit == thumbnails.LIMIT + 1
                return data
            return SimpleNamespace(status=200, read=read)
        def close(self):
            closed.append(True)
    monkeypatch.setattr(thumbnails.http.client, 'HTTPConnection', Connection)
    assert thumbnails.fetch_thumbnail(clip()) == jpeg
    assert len(calls) == len(closed) == 4
    monkeypatch.setattr(thumbnails, 'LIMIT', 4)
    assert thumbnails.fetch_thumbnail(clip()) is None


def test_cache_budget_offline_and_failed_retry():
    calls = []
    def fetch(record):
        calls.append(record)
        return record
    cache = thumbnails.ThumbnailCache(fetch=fetch, budget=6, entries=2)
    assert cache.get('a', b'aaa', 0) == b'aaa'
    assert cache.get('a', b'xxx', 0, online=False) == b'aaa'
    assert cache.get('b', b'bbbb', 0) == b'bbbb'
    assert cache.size == 4 and list(cache.values) == ['b']
    assert cache.get('unknown', b'x', 0, online=False) is None
    assert cache.get('failure', None, 0) is None
    assert cache.get('failure', b'yes', 0) is None
    assert cache.get('failure', b'yes', 0, retry=True) == b'yes'
    assert calls == [b'aaa', b'bbbb', None, b'yes']


def test_old_session_requests_cannot_publish_into_new_camera():
    started, resume = threading.Event(), threading.Event()
    def fetch(_):
        started.set()
        assert resume.wait(2)
        return b'old-camera'
    cache = thumbnails.ThumbnailCache(fetch=fetch)
    with ThreadPoolExecutor() as pool:
        request = pool.submit(cache.get, 'same-id', clip(), 0)
        assert started.wait(2)
        cache.clear()
        resume.set()
        assert request.result() is None
    assert cache.size == 0 and not cache.values
    assert cache.get('same-id', clip(), 0) is None
