"""Run editing tools with their large media and temporary caches on the selected drive."""
import argparse
import json
import os
import subprocess
from pathlib import Path
from storage import storage, StorageError


def edit_environment(source):
    destination = storage.check()
    source = Path(source).resolve(strict=True)
    if not source.is_relative_to(destination.resolve()):
        raise StorageError('Choose a video already on the selected save drive. Copy existing footage there first.')
    edit = source.parent / 'edit'
    cache = edit / '.cache'
    scratch = cache / 'tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    env = {'TEMP': str(scratch), 'TMP': str(scratch),
           'HYPERFRAMES_EXTRACT_CACHE_DIR': str(cache / 'frames'),
           'HYPERFRAMES_MEDIA_HOME': str(cache / 'media-home'),
           'XDG_CACHE_HOME': str(cache)}
    return edit, env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--print-env', action='store_true')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    edit, overrides = edit_environment(args.source)
    if args.print_env:
        print(json.dumps({'directory': str(edit), 'environment': overrides}, indent=2))
        return
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('Supply an editing command after --, or use --print-env.')
    raise SystemExit(subprocess.call(command, cwd=edit, env={**os.environ, **overrides}))


if __name__ == '__main__':
    main()
