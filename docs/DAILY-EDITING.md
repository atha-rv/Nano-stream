# Daily recording → YouTube → Instagram

Status: proposed integrated workflow, researched on 2026-10-11. Wireless recording
and original transfer work today. Editing currently uses separate local tools;
the app does not yet offer an Edit button, automatic clip selection, face tracking
or social uploads. One landscape edit was completed outside this repository.

## Intended experience

1. Record with the Nano while checking framing on the laptop. A future optional
   9:16 guide would show the area a vertical crop can retain, alongside a simple
   composition grid. Keep the subject inside that area when one recording needs
   to work in both formats.
2. Stop and copy the original onto the selected external drive, or D:.
3. Transcribe the original once. Review uncertain words, and select the opening,
   complete thoughts, pauses and ending from timestamped speech.
4. Produce a landscape YouTube edit with tighter pacing, modest colour/audio
   correction and optional captions. Keep the original resolution where useful.
5. Select self-contained moments from the same recording for Instagram. Export
   1080×1920 crops with readable captions and comfortable subject framing.
   The number and duration depend on usable content; don't force several clips
   out of a recording that only supports one.
6. Preview the cuts and vertical framing before final exports. All edit plans,
   captions, proxies and renders stay in that source video's `edit` directory.
   Uploading to platforms is a separate future integration.

Store a versioned edit decision list with original time ranges, crop keyframes,
caption timings and output settings. YouTube and vertical exports should both
render from original media and that plan, rather than recompressing a finished
landscape export for every clip. Avoid deleting originals automatically.

## Recommended reusable tools

| Tool | Role | Why it fits / limits |
| --- | --- | --- |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Transcript, word timestamps and speech activity | Already used in the separate local edit. CPU quantization is useful on this laptop. Timestamps and recognised words need review; silence is not automatically an editorial mistake. MIT. |
| [MediaPipe Tasks](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) | Locate the face/body for framing feedback and vertical crop suggestions | Reuse video detection and confidence values, then smooth the crop across time. Pause tracking when the subject disappears; offer a manual crop. Detecting a face does not decide whether a moment is interesting. Apache-2.0 framework; review model assets separately. |
| [FFmpeg](https://www.ffmpeg.org/) | Trim, join, crop, scale, mix voice and encode final files | Already used for decoding/rendering. Use FFprobe for metadata and verify complete outputs. Build-dependent LGPL/GPL; the local separately installed binary enables GPL. Not bundled here. |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Captions, titles, small graphics and consistent visual styling | HTML composition/rendering was used for the completed landscape edit. Keep export timing deterministic and test source A/V offsets. Apache-2.0. |
| [PySceneDetect](https://www.scenedetect.com/) | Optional scene-change boundaries for multi-shot footage | Useful for montages. A fixed talking-head shot can contain several strong ideas without a visual scene change, so it should not drive semantic highlight selection. BSD-3-Clause; OpenCV/PyAV backend dependencies require separate review. |

Start with the tools already exercised: faster-whisper, FFmpeg and HyperFrames.
Add MediaPipe only for the framing/crop task. Defer PySceneDetect until recordings
contain multiple shots. No new editing dependencies were installed as part of
publishing this repository, and no complete automatic editorial pipeline is
claimed. The camera's Python 3.13 environment should stay isolated: verify
editing-library wheel/platform support in a separate environment before pinning
those packages. Model downloads should use an explicit non-C: cache location.

Libraries handle recognition, tracking and rendering. Choosing a strong hook,
preserving the meaning of a sentence and deciding which moment deserves a clip
still requires editorial judgement. A future language-model integration can
propose time ranges from the transcript, with original-video review before export.
It should not invent words or infer reliable quality from tracking confidence.

## Source inspection and maintenance record

Exact upstream HEAD revisions inspected on 2026-10-11; these are research
snapshots, not newly installed dependency pins. GitHub metadata showed each repo
unarchived with pushes on October 10–11. Dependency advisories and model licenses
must be checked again when implementing an integration.

- **faster-whisper** `a52b026ac844c02117865e61968547639b60a6f8`:
  [license](https://github.com/SYSTRAN/faster-whisper/blob/a52b026ac844c02117865e61968547639b60a6f8/LICENSE),
  [dependencies](https://github.com/SYSTRAN/faster-whisper/blob/a52b026ac844c02117865e61968547639b60a6f8/requirements.txt),
  [transcription tests](https://github.com/SYSTRAN/faster-whisper/blob/a52b026ac844c02117865e61968547639b60a6f8/tests/test_transcribe.py).
  Tests exercise word timings, VAD, empty audio and timing order. Runtime includes
  CTranslate2, model/tokenizer downloads, ONNX Runtime and PyAV. Reviewed open
  timestamp-restoration work [#1667](https://github.com/SYSTRAN/faster-whisper/pull/1667);
  do not assume all boundary cases are fixed in an installed release.
- **MediaPipe** `458200ffced12a9db596ddf1cce3380ea05f71fb`:
  [license](https://github.com/google-ai-edge/mediapipe/blob/458200ffced12a9db596ddf1cce3380ea05f71fb/LICENSE),
  [face-landmarker implementation](https://github.com/google-ai-edge/mediapipe/blob/458200ffced12a9db596ddf1cce3380ea05f71fb/mediapipe/tasks/python/vision/face_landmarker.py),
  [test directory](https://github.com/google-ai-edge/mediapipe/tree/458200ffced12a9db596ddf1cce3380ea05f71fb/mediapipe/tasks/python/test/vision),
  [task guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).
  Source exposes native task bindings and video timestamps, with detection and
  tracking options. Models/native binaries remain dependencies, not pure Python.
  Open issues include platform-specific task-worker failures
  [#6375](https://github.com/google-ai-edge/mediapipe/issues/6375); that report is
  Linux/hand-task specific and does not establish a Windows face-task failure.
  Actual Windows Nano video tracking remains untested here.
- **PySceneDetect** `cb0cc3d61aa130aa99b1da41b6c0244a2c12dd65`:
  [content detector](https://github.com/Breakthrough/PySceneDetect/blob/cb0cc3d61aa130aa99b1da41b6c0244a2c12dd65/scenedetect/detectors/content_detector.py),
  [tests](https://github.com/Breakthrough/PySceneDetect/tree/cb0cc3d61aa130aa99b1da41b6c0244a2c12dd65/tests),
  [current docs](https://www.scenedetect.com/docs/latest/).
  Detector compares frame colour/brightness/edge changes. Open
  [#577](https://github.com/Breakthrough/PySceneDetect/issues/577) reports a
  minimum-scene-length boundary regression at fractional frame rates, relevant to
  29.97-fps Nano footage; test exact cut timing before adopting it.
- **HyperFrames** `ba08acb1f506b06757bd77a7e7f491d412647fbd`:
  [repository/license](https://github.com/heygen-com/hyperframes/tree/ba08acb1f506b06757bd77a7e7f491d412647fbd),
  [CLI package/dependencies](https://github.com/heygen-com/hyperframes/blob/ba08acb1f506b06757bd77a7e7f491d412647fbd/packages/cli/package.json).
  A Node/browser rendering toolchain, separate from the camera bridge. Earlier
  local edit used CLI 0.8.147. Open export timing work
  [#5455](https://github.com/heygen-com/hyperframes/pull/5455) concerns sources with
  differing A/V start times; compare rendered sound and picture against source.
- **FFmpeg**: separately installed 8.0 full build on the development PC, with
  `--enable-gpl --enable-version3`. See the official
  [filter documentation](https://ffmpeg.org/ffmpeg-filters.html) and
  [license guidance](https://www.ffmpeg.org/legal.html). No executable is committed.

Upstream tests were inspected for the new recommendations, not executed in this
repository. The earlier completed local edit was rendered and fully decoded;
that does not verify automatic clip selection or face-following crops.

## Implementation order and acceptance checks

1. Optional composition and vertical guides over the existing preview, with a
   simple on/off control and no effect on the recorded original.
2. Local edit project and transcript review; preserve source timestamps and
   cancel/resume behaviour without filling C:.
3. Landscape cut and a manually selected vertical clip. Verify audio sync,
   complete decoding, captions, no clipped words and meaningful start/end.
4. Subject-following crop with smoothing, manual adjustment and lost-subject
   feedback. Preview phone-sized captions and leave room for platform controls.
5. Suggested highlights and batch exports, with review of each complete thought.

Use realistic tests: moving/out-of-frame subject, no face, multiple faces,
quiet/noisy speech, 29.97-fps timing, long takes, low space, drive removal,
cancelled export and restart recovery. Do not present model confidence as
editorial quality or silently remove intentional pauses.
