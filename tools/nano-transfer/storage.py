"""Remember a Windows volume, not its changeable drive letter. No new dependency."""
import json
import ctypes
from ctypes import wintypes
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

SETTINGS = Path(__file__).resolve().parents[2] / '.research' / 'nano-storage.json'
DEFAULT = Path('D:/Osmo Nano')
INVENTORY = r"""
$ErrorActionPreference = 'Stop'
$items = @(Get-Disk | Where-Object BusType -eq USB | Get-Partition |
  Where-Object DriveLetter | Get-Volume | ForEach-Object {
    [pscustomobject]@{id=$_.UniqueId; root=([string]$_.DriveLetter + ':\');
      label=$_.FileSystemLabel; filesystem=$_.FileSystem;
      free=[long]$_.SizeRemaining; size=[long]$_.Size}
  })
ConvertTo-Json -InputObject $items -Compress
"""


class StorageError(ValueError):
    pass


def windows_volumes():
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive',
                             '-Command', INVENTORY], capture_output=True,
                            text=True, timeout=12, creationflags=0x08000000)
    if result.returncode:
        raise StorageError('Windows could not list USB drives. Reconnect the drive and refresh.')
    return json.loads(result.stdout.lstrip('\ufeff') or '[]')


def volume_identity(root):
    # Microsoft's volume API is fast enough to check during each download chunk.
    api = ctypes.WinDLL('kernel32', use_last_error=True).GetVolumeNameForVolumeMountPointW
    api.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
    api.restype = wintypes.BOOL
    buffer = ctypes.create_unicode_buffer(64)
    return buffer.value if api(str(root), buffer, len(buffer)) else None


class Storage:
    def __init__(self, settings=SETTINGS, inventory=windows_volumes, default=DEFAULT, identity=volume_identity):
        self.settings, self.inventory, self.default = Path(settings), inventory, Path(default)
        self.lock = threading.RLock()
        self.identity = identity
        self.volumes = []
        self.selection = {'version': 2, 'id': 'auto', 'path': str(self.default), 'preferredId': None}
        self.error = None
        try:
            if self.settings.exists():
                self.selection = json.loads(self.settings.read_text(encoding='utf-8-sig'))
                if not isinstance(self.selection.get('id'), str) or not self.selection.get('path'):
                    raise ValueError('Invalid save location')
                if self.selection.get('version') != 2:
                    # Upgrade the previous forced USB setting to the user's automatic preference.
                    previous_id = self.selection['id']
                    self.selection = {'version': 2, 'id': 'auto', 'path': str(self.default),
                                      'preferredId': previous_id if previous_id != 'pc' else None}
        except (OSError, ValueError, AttributeError):
            self.error = 'The saved location cannot be read. Select a save location again.'

    def refresh(self):
        try:
            volumes = self.inventory()
        except (StorageError, OSError, subprocess.TimeoutExpired, ValueError) as error:
            raise StorageError('USB detection failed. Reconnect the drive and refresh.') from error
        with self.lock:
            self.volumes = volumes
        return self.status()

    def selected_volume(self):
        available = [v for v in self.volumes if self.identity(v['root']) == v['id'] and Path(v['root']).is_dir()]
        if self.selection['id'] == 'pc':
            return None
        if self.selection['id'] == 'auto':
            preferred = next((v for v in available if v['id'] == self.selection.get('preferredId')), None)
            return preferred or next(iter(sorted(available, key=lambda v: v['root'])), None)
        volume = next((v for v in available if v['id'] == self.selection['id']), None)
        if not volume:
            raise StorageError('Your preferred USB drive is missing. Reconnect it or choose Automatic / D: in Preferences. Videos stay on the camera.')
        return volume

    def destination(self, fresh=False):
        if fresh:
            self.refresh()
        with self.lock:
            if self.error:
                raise StorageError(self.error)
            volume = self.selected_volume()
            destination = Path(volume['root']) / 'Osmo Nano' if volume else self.default
            if not volume and not Path(self.default.anchor).is_dir():
                raise StorageError('D: is unavailable. Connect an external drive. C: is never used for videos.')
            return destination

    def status(self):
        with self.lock:
            volume = None
            path = str(self.default) if self.selection['id'] in ('pc', 'auto') else self.selection['path']
            error = self.error
            try:
                destination = self.destination()
                volume = self.selected_volume()
                path = str(destination)
                root = Path(volume['root']) if volume else Path(destination.anchor)
                free = shutil.disk_usage(root).free
            except (StorageError, OSError) as failure:
                free = None
                error = str(failure)
            return {'selectedId': self.selection['id'], 'destination': path,
                    'available': not error, 'error': error, 'free': free,
                    'filesystem': volume['filesystem'] if volume else None,
                    'external': volume is not None, 'automatic': self.selection['id'] == 'auto',
                    'volumes': list(self.volumes)}

    def check(self, sizes=(), fresh=True):
        destination = self.destination(fresh=fresh)
        pending = [int(size or 0) for size in sizes]
        status = self.status()
        if status['filesystem'] == 'FAT32' and any(size >= 2**32 for size in pending):
            raise StorageError('This video is too large for FAT32. Select an exFAT or NTFS drive. The original stays on the camera.')
        if status['free'] is None or sum(pending) + 64 * 1024**2 > status['free']:
            raise StorageError('The selected drive needs more free space. The original stays on the camera.')
        try:
            destination.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryFile(dir=destination) as test:
                test.write(b'nano-storage-check')
                test.flush()
        except OSError as error:
            raise StorageError('Cannot write to the selected drive. Reconnect it or choose another location.') from error
        return destination

    def choose(self, volume_id):
        self.refresh()
        with self.lock:
            previous, previous_error = self.selection, self.error
            if volume_id in ('pc', 'auto'):
                candidate = {'version': 2, 'id': volume_id, 'path': str(self.default),
                             'preferredId': self.selection.get('preferredId')}
            else:
                volume = next((v for v in self.volumes if v['id'] == volume_id), None)
                if not volume:
                    raise StorageError('That USB drive is no longer connected. Refresh the list.')
                candidate = {'version': 2, 'id': volume_id, 'path': str(Path(volume['root']) / 'Osmo Nano'),
                             'preferredId': volume_id}
            self.selection, self.error = candidate, None
            try:
                self.check(fresh=False)
                self.settings.parent.mkdir(parents=True, exist_ok=True)
                temp = self.settings.with_suffix('.tmp')
                temp.write_text(json.dumps(candidate, indent=2), encoding='utf-8')
                os.replace(temp, self.settings)
            except (OSError, StorageError):
                self.selection, self.error = previous, previous_error
                raise
            return self.status()


storage = Storage()


def guard_downloads(http, destination):
    """Pin a transfer to one volume. Automatic fallback applies to the next transfer."""
    original = http.download
    target = next((v for v in storage.volumes if Path(v['root']) / 'Osmo Nano' == destination), None)
    root = target['root'] if target else destination.anchor
    identity = target['id'] if target else storage.identity(root)
    filesystem = target['filesystem'] if target else None

    def check_identity():
        if not identity or storage.identity(root) != identity:
            raise StorageError('The save drive was removed or replaced during copying. Reconnect it and retry; originals stay on the camera.')

    def download(*args, **kwargs):
        check_identity()
        size = kwargs.get('expected_size') or 0
        if filesystem == 'FAT32' and size >= 2**32:
            raise StorageError('This file exceeds the FAT32 limit. Choose exFAT or NTFS.')
        if shutil.disk_usage(root).free < size + 64 * 1024**2:
            raise StorageError('The save drive needs more free space. Originals stay on the camera.')
        original_cancelled = kwargs.get('cancelled')
        def checked_cancelled():
            check_identity()
            return original_cancelled() if original_cancelled else False
        kwargs['cancelled'] = checked_cancelled
        return original(*args, **kwargs)

    http.download = download
