"""Exercise the real worker methods with deterministic camera/volume adapters.

Load the class without the platform bridge imports or its background watcher;
these tests require neither hardware credentials nor upstream runtime packages.
"""
import ast
import json
from pathlib import Path
from types import SimpleNamespace
import queue
import threading
import pytest
import gallery
from thumbnails import ThumbnailCache


@pytest.fixture
def harness(tmp_path):
    source = ast.parse(Path(__file__).with_name('server.py').read_text())
    node = next(n for n in source.body if isinstance(n, ast.ClassDef) and n.name == 'Monitor')
    resources = []
    class Resource:
        def __init__(self, *args):
            self.closed = False
            resources.append(self)
        def close(self):
            self.closed = True
    root = tmp_path / 'media'
    root.mkdir()
    check = lambda *args, **kwargs: root
    storage = SimpleNamespace(check=check)
    namespace = dict(vars(gallery), threading=threading, queue=queue,
                     storage=storage, WORKSPACE=tmp_path, HistoryDB=Resource,
                     CameraHttp=Resource, config=SimpleNamespace(CONFIG_DIR=tmp_path),
                     guard_downloads=lambda *args: None, OffloadConfig=lambda **kwargs: kwargs,
                     wifi=SimpleNamespace(rejoin_sync=lambda _: None),
                     probe=lambda _: SimpleNamespace(duration_s=1, width=1920, height=1080))
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'server.py', 'exec'), namespace)
    monitor = namespace['Monitor'].__new__(namespace['Monitor'])
    monitor.lock = threading.RLock()
    monitor.state = {'phase': 'live', 'recording': False, 'saved': [], 'batches': []}
    monitor.cancel_transfer = threading.Event()
    monitor.commands = queue.Queue()
    clip = SimpleNamespace(name='DJI_20261011120000_0001_D.MP4', size=100,
                           media_path='DCIM/test', storage=1, handle=0x40100001, is_video=True)
    monitor.library_records = {gallery.record_id(clip): clip}
    monitor.thumbnails = ThumbnailCache(fetch=lambda _: b'thumbnail')
    return monitor, namespace, resources, root, clip


def test_thumbnails_require_known_current_session_and_avoid_busy_camera(harness):
    monitor, _, _, _, clip = harness
    identifier = gallery.record_id(clip)
    assert monitor.thumbnail('../arbitrary/path', '0') is None
    assert monitor.thumbnail(identifier, '999') is None
    monitor.state['recording'] = True
    assert monitor.thumbnail(identifier, '0') is None
    monitor.state['recording'] = False
    assert monitor.thumbnail(identifier, '0') == b'thumbnail'
    monitor.state['phase'] = 'disconnected'
    assert monitor.thumbnail(identifier, '0') == b'thumbnail'
    monitor.thumbnails.clear()
    assert monitor.thumbnail(identifier, '0') is None
    assert monitor.thumbnail(identifier, '1') is None


def test_selection_rejects_paths_unknown_ids_and_busy_recording(harness):
    monitor, _, _, _, clip = harness
    for body in [{'ids': ['unknown']}, {'ids': []}, {'ids': [gallery.record_id(clip)], 'path': '../escape'}, {'ids': 'all'}]:
        with pytest.raises(ValueError):
            monitor.action('download', body)
    monitor.state['recording'] = True
    with pytest.raises(ValueError):
        monitor.action('download', {'ids': [gallery.record_id(clip)]})
    monitor.state['recording'] = False
    monitor.action('download', {'ids': [gallery.record_id(clip)] * 2, 'label': 'Today'})
    assert monitor.state['phase'] == 'downloading'
    assert len(monitor.commands.get()[1]) == 1
    with pytest.raises(ValueError):
        monitor.action('download', {'ids': [gallery.record_id(clip)]})
    monitor.action('cancel')
    assert monitor.cancel_transfer.is_set()


@pytest.mark.parametrize('interrupt', [False, True])
def test_completed_files_are_journalled_and_resources_closed(harness, interrupt):
    monitor, namespace, resources, root, clip = harness
    target = gallery.safe_destination(clip, root)
    class Offloader:
        def __init__(self, *args):
            pass
        def plan(self, records):
            return [SimpleNamespace(record=clip, dest=target, skipped=None, size=100)]
        def run(self, plan, progress, **kwargs):
            target.parent.mkdir(parents=True)
            target.write_bytes(b'x' * 100)
            copied = {'original': clip.name, 'dest_path': str(target), 'hash': 'fixture-hash', 'size': 100}
            value = SimpleNamespace(results=[copied], done_bytes=100, current_done=0,
                                    total_bytes=100, total_files=1, done_files=1,
                                    current_name=clip.name, failures=[])
            progress(value)
            assert monitor.state['transfer']['bytesDone'] == 100
            journal = json.loads(next(root.rglob('batch.json')).read_text())
            assert journal['files'][0]['status'] == 'downloaded'
            if interrupt:
                raise OSError('drive removed after a completed file')
            return value
    namespace['Offloader'] = Offloader
    if interrupt:
        with pytest.raises(OSError):
            monitor.copy_records([clip], SimpleNamespace(ssid='test'), 'Today', True)
    else:
        assert monitor.copy_records([clip], SimpleNamespace(ssid='test'), 'Today')['status'] == 'complete'
    assert all(resource.closed for resource in resources)
    batch = json.loads(next(root.rglob('batch.json')).read_text())
    assert batch['files'][0]['status'] == 'downloaded'
    assert batch['status'] == ('partial' if interrupt else 'complete')
    assert target.read_bytes() == b'x' * 100
    assert monitor.state['saved'][0]['dest_path'] == str(target)
