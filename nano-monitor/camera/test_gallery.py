from pathlib import Path
from types import SimpleNamespace
import json
import pytest
from gallery import (GalleryError, Page, Slice, chronological, entry, make_batch,
                     recorded_at, record_id, safe_destination, walk_library)


def record(number, date='20261011', store=1):
    name = f'DJI_{date}120000_{number:04d}_D.MP4'
    return SimpleNamespace(name=name, size=100, handle=(0x40100000 if store else 0x100000) + number * 64,
                           media_path=f'DCIM/DJI_001/{name[:-4]}', storage=store, is_video=True)


def test_pages_walk_each_store_and_deduplicate_cursor_overlap():
    internal = [record(n) for n in range(100, 55, -1)]
    sd = [record(n, store=0) for n in range(70, 25, -1)]
    older = [internal[-1], record(54), record(53, date='20261010')]
    calls = []
    def fetch(cursors):
        calls.append(cursors)
        if len(calls) == 1:
            return Page({0: Slice(sd, 45), 1: Slice(internal, 45)})
        return Page({0: Slice([sd[-1], record(24, store=0)], final=True), 1: Slice(older, final=True)})
    records, complete, warning = walk_library(fetch)
    assert complete and warning is None and len(records) == 93
    assert calls[1][0] == sd[-1].handle and calls[1][1] == internal[-1].handle
    assert len({record_id(r) for r in records}) == len(records)


def test_truncated_unanswered_and_repeated_pages_never_claim_complete():
    full = [record(n) for n in range(100, 55, -1)]
    for second in [Page({0: Slice([]), 1: Slice(full[:2], declared=45)}),
                   Page({0: Slice([]), 1: Slice([], answered=False)}),
                   Page({0: Slice([]), 1: Slice(full, declared=45)})]:
        pages = iter([Page({0: Slice([]), 1: Slice(full, 45)}), second])
        records, complete, warning = walk_library(lambda _: next(pages))
        assert not complete and warning and len(records) == 45


def test_empty_camera_cancellation_and_page_limit_are_distinct():
    records, complete, warning = walk_library(lambda _: Page({0: Slice([]), 1: Slice([])}))
    assert records == [] and complete and warning is None
    records, complete, warning = walk_library(lambda _: None, cancelled=lambda: True)
    assert not complete and 'cancelled' in warning
    records, complete, warning = walk_library(lambda _: Page({0: Slice([]), 1: Slice([record(n) for n in range(100, 55, -1)], 45)}), max_pages=1)
    assert len(records) == 45 and not complete and 'limit' in warning


def test_chronology_uses_camera_clock_and_keeps_unknown_times_explicit():
    newer, older = record(90), record(80, date='20261010')
    unknown = record(1)
    unknown.name = 'custom-clip.MP4'
    assert chronological([unknown, newer, older]) == [older, newer, unknown]
    assert recorded_at('DJI_20261399121212_0001_D.MP4') is None
    assert entry(newer)['recordedAt'] == '2026-10-11T12:00:00'
    assert entry(unknown)['recordedAt'] is None


def test_existing_correct_size_is_saved_but_conflict_is_not_overwritten(tmp_path):
    clip = record(1)
    target = safe_destination(clip, tmp_path)
    target.parent.mkdir(parents=True)
    target.write_bytes(b'x' * 100)
    assert entry(clip, tmp_path)['alreadySaved']
    target.write_bytes(b'short')
    assert entry(clip, tmp_path)['conflict'] and not entry(clip, tmp_path)['alreadySaved']
    assert target.read_bytes() == b'short'
    clip.name = '../escape.MP4'
    with pytest.raises(GalleryError):
        safe_destination(clip, tmp_path)


def test_batch_is_durable_chronological_and_source_adjacent(tmp_path):
    source = tmp_path / 'external'
    path, manifest = make_batch([record(9), record(2, date='20261010')], source, 'Today')
    assert path.is_relative_to(source)
    loaded = json.loads(path.read_text())
    assert loaded['cameraTimezone'] == 'unspecified camera-local clock'
    assert loaded['files'][0]['recordedAt'] < loaded['files'][1]['recordedAt']
    assert loaded['status'] == 'downloading'
    assert all(Path(row['dest_path']).is_relative_to(source) for row in loaded['files'])
    assert (path.parent / 'EDIT-THIS-DUMP.md').exists()
