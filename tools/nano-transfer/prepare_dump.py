"""Create a chronological editing intake, optionally with cached local word timings.

Not an automatic editor: the editor reads all source speech and visuals to choose
the story, then renders YouTube plus Reels using the approved foundation.
"""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sys


def sources(manifest):
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('files'), list):
        raise ValueError('Unsupported camera batch manifest.')
    root = Path(manifest['mediaRoot']).resolve(strict=True)
    usable = []
    for row in manifest['files']:
        if row.get('status') not in ('downloaded', 'already_present'):
            continue
        path = Path(row['dest_path']).resolve(strict=True)
        if not path.is_relative_to(root) or path.suffix.lower() not in ('.mp4', '.mov'):
            raise ValueError('A batch source is outside its footage drive or is not a video.')
        usable.append((row, path))
    return sorted(usable, key=lambda item: (not bool(item[0].get('recordedAt')), item[0].get('recordedAt') or '', item[0]['name']))


def identity(path):
    stat = path.stat()
    return {'size': stat.st_size, 'mtime_ns': stat.st_mtime_ns}


def cached_transcript(path, output, model_name, load_model):
    key = identity(path)
    if output.exists():
        try:
            cached = json.loads(output.read_text(encoding='utf-8'))
            if cached.get('sourceIdentity') == key and cached.get('model') == model_name:
                return cached, True
        except (ValueError, OSError):
            pass  # A damaged/incomplete cache can be regenerated from originals.
    segments, info = load_model().transcribe(str(path), word_timestamps=True, vad_filter=False,
                                            condition_on_previous_text=True)
    data = {'schemaVersion': 1, 'source': str(path), 'sourceIdentity': key, 'model': model_name,
            'language': info.language, 'languageProbability': info.language_probability,
            'segments': [{'start': segment.start, 'end': segment.end, 'text': segment.text,
                          'words': [{'start': word.start, 'end': word.end, 'word': word.word,
                                     'probability': word.probability} for word in segment.words or []]}
                         for segment in segments]}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, output)
    return data, False


def prepare(batch_path, transcribe=False, model_name='small.en', model_factory=None):
    batch_path = Path(batch_path).resolve(strict=True)
    manifest = json.loads(batch_path.read_text(encoding='utf-8'))
    files = sources(manifest)
    root = Path(manifest['mediaRoot']).resolve()
    if not batch_path.is_relative_to(root):
        raise ValueError('Keep batch.json on the same drive as its footage before preparing an edit.')
    if not files:
        raise ValueError('This batch has no completed local videos to prepare.')
    editing = batch_path.parent / 'edit'
    cache = editing / '.cache'
    temporary = cache / 'tmp'
    temporary.mkdir(parents=True, exist_ok=True)
    os.environ.update(TEMP=str(temporary), TMP=str(temporary), HF_HOME=str(cache / 'huggingface'),
                      HF_HUB_CACHE=str(cache / 'huggingface' / 'hub'),
                      HYPERFRAMES_EXTRACT_CACHE_DIR=str(cache / 'frames'),
                      HYPERFRAMES_MEDIA_HOME=str(cache / 'media-home'), XDG_CACHE_HOME=str(cache))
    model = None
    def load_model():
        nonlocal model
        if model is None:
            if model_factory:
                model = model_factory()
            else:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as error:
                    raise ValueError('faster-whisper is not installed in this editing Python environment. See docs/DAILY-EDITING.md; the camera environment stays separate.') from error
                model = WhisperModel(model_name, device='cpu', compute_type='int8', cpu_threads=4,
                                     download_root=str(cache / 'models'))
        return model
    lines = ['# Chronological story intake', '', f"Batch: {manifest.get('label', 'Camera dump')}",
             f'Prepared: {datetime.now().astimezone().isoformat()}', '',
             'Default deliverables: YouTube landscape edit plus vertical Instagram Reels.',
             'Style: white Helvetica/Arial-style typography; natural voice/colour; restrained motion; optional neon pink.',
             'Read across all clips before choosing a story. Dates use the camera clock, not a confirmed timezone.',
             'Review visuals at possible cut points. Preserve originals; keep renders/caches on this drive.', '',
             '## Sources in recording order', '']
    failures = []
    for number, (row, path) in enumerate(files, 1):
        lines += [f"### {number}. {row['name']}", '', f"Recorded: {row.get('recordedAt') or 'unknown'}",
                  f"Source: {path}", f"Duration: {row.get('durationSeconds') or 'not indexed'} seconds", '']
        if transcribe:
            output = path.parent / 'edit' / 'transcripts' / (path.stem + '.json')
            try:
                data, reused = cached_transcript(path, output, model_name, load_model)
                print(f"{'Cached' if reused else 'Transcribed'} {row['name']}", flush=True)
                lines += [f'Transcript: {output}', f"Detected language: {data['language']}", '']
                for segment in data['segments']:
                    lines.append(f"[{segment['start']:.2f}–{segment['end']:.2f}] {segment['text'].strip()}")
                if not data['segments']:
                    lines.append('No speech detected. Inspect the video for visual material.')
                lines.append('')
            except Exception as error:
                failures.append(f"{row['name']}: {error}")
                lines += [f'Transcription failed: {error}', '']
        else:
            lines += ['Not transcribed yet. Run prepare_dump.py with --transcribe to build cached word-timed transcripts.', '']
    lines += ['## Editorial pass', '',
              'Find a clear opening, a complete thought or developing story, and a satisfying ending.',
              'Select clips for meaning, not merely time order. Preserve context across files.',
              'For each Reel choose a self-contained moment, then check crop, captions and audio sync.',
              'Use the approved editing foundation; pending references are not approved assets.', '']
    output = editing / 'story-intake.md'
    output.write_text('\n'.join(lines), encoding='utf-8')
    return output, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', required=True, type=Path)
    parser.add_argument('--transcribe', action='store_true')
    parser.add_argument('--model', default='small.en', help='small.en for English; small for multilingual speech, or a local model path')
    args = parser.parse_args()
    try:
        if args.batch.resolve().drive.lower() == 'c:':
            raise ValueError('Move the batch and footage to your selected external drive or D: before preparing an edit; C: is excluded.')
        output, failures = prepare(args.batch, args.transcribe, args.model)
        print(f'Editing intake: {output}', flush=True)
        for failure in failures:
            print(failure, file=sys.stderr)
        return 2 if failures else 0
    except (ValueError, OSError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
