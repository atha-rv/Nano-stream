from collections import namedtuple
from pathlib import Path
import pytest
import storage as module
from storage import Storage, StorageError


@pytest.fixture
def setup(tmp_path):
    root = tmp_path / 'drive'
    root.mkdir()
    volumes = [{'id': 'usb-one', 'root': str(root), 'filesystem': 'exFAT',
                'free': 10**10, 'size': 20**10, 'label': 'USB'}]
    settings = tmp_path / 'settings.json'
    identity = lambda root: next((v['id'] for v in volumes if v['root'] == root), None)
    store = Storage(settings, lambda: list(volumes), tmp_path / 'internal' / 'videos', identity=identity)
    return store, volumes, settings


def test_persistence_and_changed_drive_letter(setup, tmp_path):
    store, volumes, settings = setup
    store.choose('usb-one')
    replacement = tmp_path / 'new-letter'
    replacement.mkdir()
    volumes[0]['root'] = str(replacement)
    reloaded = Storage(settings, lambda: volumes, identity=store.identity)
    assert reloaded.check() == replacement / 'Osmo Nano'


def test_missing_drive_and_reused_letter_never_fall_back(setup):
    store, volumes, settings = setup
    original_root = Path(volumes[0]['root'])
    store.choose('usb-one')
    volumes[0]['id'] = 'different-usb'
    with pytest.raises(StorageError, match='missing'):
        store.check()
    assert not store.default.exists()
    assert original_root.exists()
    assert Storage(settings, lambda: volumes, identity=store.identity).selection['id'] == 'usb-one'
    volumes[0]['id'] = 'usb-one'
    assert store.check().is_dir()


def test_fat32_and_free_space_block_before_download(setup, monkeypatch):
    store, volumes, _ = setup
    store.choose('usb-one')
    volumes[0]['filesystem'] = 'FAT32'
    with pytest.raises(StorageError, match='FAT32'):
        store.check([2**32])
    Usage = namedtuple('Usage', 'total used free')
    monkeypatch.setattr(module.shutil, 'disk_usage', lambda root: Usage(1000, 900, 100))
    with pytest.raises(StorageError, match='free space'):
        store.check([10])


def test_invalid_setting_and_readonly_selection_do_not_change_destination(setup, monkeypatch):
    store, volumes, settings = setup
    def readonly(*args, **kwargs):
        raise PermissionError('read-only')
    monkeypatch.setattr(module.tempfile, 'TemporaryFile', readonly)
    with pytest.raises(StorageError, match='Cannot write'):
        store.choose('usb-one')
    assert store.selection['id'] == 'auto'
    assert not settings.exists()
    settings.write_text('not json')
    broken = Storage(settings, lambda: volumes)
    with pytest.raises(StorageError, match='cannot be read'):
        broken.check()


def test_each_download_checks_drive_identity(setup, monkeypatch):
    store, volumes, _ = setup
    destination = Path(store.choose('usb-one')['destination'])
    monkeypatch.setattr(module, 'storage', store)
    calls = []
    class Http:
        def download(self, *args, **kwargs):
            calls.append(args)
            return 'copied'
    http = Http()
    module.guard_downloads(http, destination)
    assert http.download(0, 'camera/file', destination / 'file', expected_size=100) == 'copied'
    volumes.clear()
    with pytest.raises(StorageError, match='removed'):
        http.download(0, 'camera/next', destination / 'next', expected_size=100)
    assert len(calls) == 1


def test_drive_removed_mid_download_stops_before_retry(setup, monkeypatch):
    store, volumes, _ = setup
    destination = Path(store.choose('usb-one')['destination'])
    monkeypatch.setattr(module, 'storage', store)
    class Http:
        def download(self, *args, **kwargs):
            assert kwargs['cancelled']() is False
            volumes[0]['id'] = 'replacement'
            kwargs['cancelled']()
            pytest.fail('Download continued onto another drive')
    http = Http()
    module.guard_downloads(http, destination)
    with pytest.raises(StorageError, match='removed'):
        http.download(0, 'file', destination / 'file', expected_size=100)


def test_automatic_external_then_internal_and_back(setup):
    store, volumes, settings = setup
    assert store.check() == Path(volumes[0]['root']) / 'Osmo Nano'
    external = volumes.pop()
    assert store.check() == store.default
    assert store.status()['automatic'] and not store.status()['external']
    volumes.append(external)
    assert store.check() == Path(external['root']) / 'Osmo Nano'
    store.choose('pc')
    assert store.check() == store.default
    store.choose('auto')
    assert store.check() == Path(external['root']) / 'Osmo Nano'


def test_transfer_stays_on_original_drive_if_auto_destination_changes(setup, monkeypatch, tmp_path):
    store, volumes, _ = setup
    destination = store.check()
    monkeypatch.setattr(module, 'storage', store)
    class Http:
        def download(self, *args, **kwargs):
            other = tmp_path / 'another-drive'
            other.mkdir()
            volumes.insert(0, {'id': 'other', 'root': str(other), 'filesystem': 'exFAT'})
            store.refresh()
            assert kwargs['cancelled']() is False
            return 'original-drive'
    http = Http()
    module.guard_downloads(http, destination)
    assert http.download(0, 'file', destination / 'file', expected_size=100) == 'original-drive'


def test_legacy_usb_preference_upgrades_to_auto(setup):
    store, volumes, settings = setup
    import json
    settings.write_text(json.dumps({'id': 'usb-one', 'path': str(Path(volumes[0]['root']) / 'Osmo Nano')}))
    reloaded = Storage(settings, lambda: volumes, default=store.default, identity=store.identity)
    assert reloaded.selection['id'] == 'auto'
    assert reloaded.selection['preferredId'] == 'usb-one'
    volumes.clear()
    assert reloaded.check() == store.default
