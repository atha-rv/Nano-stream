from pathlib import Path
from types import SimpleNamespace
import json
import pytest
from prepare_dump import cached_transcript, prepare, sources


def test_dump_orders_completed_sources_and_excludes_partial_files(tmp_path):
    root = tmp_path / 'drive'
    root.mkdir()
    older, newer = root / 'old.mp4', root / 'new.mp4'
    older.write_bytes(b'original'); newer.write_bytes(b'original')
    manifest = {'schemaVersion':1,'mediaRoot':str(root),'label':'Today','files':[
        {'name':'new.mp4','dest_path':str(newer),'recordedAt':'2026-10-11T12:00:00','status':'downloaded'},
        {'name':'old.mp4','dest_path':str(older),'recordedAt':'2026-10-11T11:00:00','status':'already_present'},
        {'name':'partial.mp4','status':'cancelled'}]}
    assert [row['name'] for row,path in sources(manifest)] == ['old.mp4','new.mp4']
    folder = root / 'Nano' / 'batches' / 'one'; folder.mkdir(parents=True)
    batch = folder / 'batch.json'; batch.write_text(json.dumps(manifest))
    output, failures = prepare(batch)
    text = output.read_text()
    assert output.is_relative_to(root) and not failures
    assert text.index('1. old.mp4') < text.index('2. new.mp4')
    assert older.read_bytes() == b'original'
    outside = tmp_path / 'outside.mp4'; outside.write_bytes(b'other')
    manifest['files'][0]['dest_path'] = str(outside)
    with pytest.raises(ValueError,match='outside'):
        sources(manifest)


def test_word_timed_transcript_cache_invalidates_when_source_changes(tmp_path):
    source = tmp_path / 'clip.mp4'; source.write_bytes(b'first')
    output = tmp_path / 'edit' / 'transcripts' / 'clip.json'
    calls = []
    class Model:
        def transcribe(self,path,**kwargs):
            calls.append(kwargs)
            word=SimpleNamespace(start=.1,end=.5,word=' hello',probability=.95)
            segment=SimpleNamespace(start=.1,end=.5,text=' hello',words=[word])
            return iter([segment]),SimpleNamespace(language='en',language_probability=.99)
    load = lambda: Model()
    data, cached = cached_transcript(source,output,'small.en',load)
    assert not cached and data['segments'][0]['words'][0]['start'] == .1
    assert calls[0]['word_timestamps'] and not calls[0]['vad_filter']
    assert cached_transcript(source,output,'small.en',load)[1]
    source.write_bytes(b'changed source')
    assert not cached_transcript(source,output,'small.en',load)[1]
    assert len(calls) == 2
