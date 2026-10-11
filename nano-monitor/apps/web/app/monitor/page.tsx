'use client';

import {useEffect, useRef, useState} from 'react';
import {Button} from '@kit/ui/button';
import {Camera, FolderOpen, Maximize, Radio, Square, Video, Wifi, CheckCircle2} from 'lucide-react';
import './monitor.css';
import {cameraRequest, previewUrl} from './camera-client';

type Saved = {original: string; size: number; dest_path: string};
type Volume = {id: string; root: string; label: string; filesystem: string; free: number};
type Storage = {selectedId: string; available: boolean; error: string | null; free: number | null; external: boolean; automatic: boolean; filesystem: string | null; volumes: Volume[]};
type State = {phase: string; message: string; recording: boolean; battery: number | null; saved: Saved[]; error: string | null; destination: string; progress: number | null; frames: number; previewAge: number | null; storage?: Storage};
const initial: State = {phase: 'loading', message: 'Checking the local camera bridge…', recording: false, battery: null, saved: [], error: null, destination: '', progress: null, frames: 0, previewAge: null};
const formatSize = (bytes: number) => bytes >= 1e9 ? `${(bytes/1e9).toFixed(2)} GB` : `${(bytes/1e6).toFixed(1)} MB`;

export default function MonitorPage() {
  const [state, setState] = useState<State>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [location, setLocation] = useState<string | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const connected = ['live','recording','pending','saving','preview_unavailable'].includes(state.phase);
  const ready = ['live','recording','preview_unavailable'].includes(state.phase);
  const idle = ['disconnected','error','offline'].includes(state.phase);
  const stale = connected && state.phase !== 'saving' && state.previewAge !== null && state.previewAge > 3;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await cameraRequest('state', 'GET', undefined, controller.signal);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!stopped) setState(data);
      } catch (failure) {
        if (!stopped) setState(previous => ({...previous, phase: 'offline', message: failure instanceof Error ? failure.message : 'Cannot reach the camera bridge.'}));
      } finally {
        if (!stopped) timer = setTimeout(poll, 750);
      }
    };
    void poll();
    return () => {stopped = true; clearTimeout(timer); controller.abort();};
  }, []);

  async function action(name: string, body?: object) {
    setBusy(name); setError(null);
    try {
      const response = await cameraRequest(name, 'POST', body);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Camera action failed.');
      setState(data);
      if (name === 'connect') setGeneration(value => value + 1);
      if (name === 'storage') setLocation(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Camera action failed.');
    } finally {setBusy(null);}
  }

  async function refreshStorage() {
    setStorageBusy(true); setError(null);
    try {
      const response = await cameraRequest('storage');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
    } catch (failure) {setError(failure instanceof Error ? failure.message : 'Could not refresh USB drives.');}
    finally {setStorageBusy(false);}
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await panel.current?.requestFullscreen();
    } catch {setError('Fullscreen is unavailable in this browser. You can maximize the browser window.');}
  }

  return <main className="nm" ref={panel}>
    <header className="nm-header">
      <div className="nm-brand"><span className="nm-mark"><Camera size={21}/></span><div><h1>Nano Monitor</h1><p>Your camera. A bigger view.</p></div></div>
      <div className="nm-header-actions"><span className="nm-local"><Wifi size={14}/>On this PC</span>
        {idle && <Button className="nm-connect" disabled={!!busy || state.phase === 'offline'} onClick={() => action('connect')}><Radio size={16}/>Connect Nano</Button>}
        {connected && <Button variant="outline" disabled={!!busy || state.recording || !ready} onClick={() => action('disconnect')}>Disconnect</Button>}
        {['connecting','disconnecting','loading'].includes(state.phase) && <span className="nm-working">{state.phase === 'connecting' ? 'Connecting…' : state.phase === 'disconnecting' ? 'Disconnecting…' : 'Starting…'}</span>}
      </div>
    </header>

    <details className="nm-guide" open={!connected || undefined}><summary>How to connect your Nano</summary><ol>
      <li><strong>Power on the Nano nearby.</strong> Attach the Vision Dock so you can approve pairing if asked.</li>
      <li><strong>Enable Bluetooth and Wi-Fi on this PC.</strong> Disconnect the camera in DJI Mimo on your phone.</li>
      <li><strong>Click Connect Nano.</strong> For first pairing, tap Approve on the dock. Allow time to join the camera’s Wi-Fi.</li>
      <li><strong>Wait for the live picture.</strong> Record on Nano, then Stop &amp; save. Disconnect when finished.</li>
    </ol><p>Bluetooth finds and pairs the camera. Wi-Fi carries the preview and videos. If connection fails, disconnect Mimo, wake the camera and try again.</p></details>

    <div className="nm-workspace">
      <section className="nm-view" aria-label="Live camera view">
        <div className="nm-view-heading"><span className="nm-eyebrow">LIVE VIEW</span><Button variant="ghost" aria-label="Toggle fullscreen monitor" onClick={fullscreen}><Maximize size={16}/><span>Fullscreen</span></Button></div>
        <div className="nm-picture">
          {connected ? <>
            {/* A same-origin MJPEG stream from the local FFmpeg decoder. Keep the full image visible. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl(generation)} alt="Live framing from your Osmo Nano" width={1280} height={720}/>
            {!state.frames && <div className="nm-overlay"><Radio size={32}/><p>Waiting for the camera picture…</p></div>}
            {state.phase === 'saving' && <div className="nm-overlay nm-saving"><p>Saving the original video…</p><span>Live view resumes when the copy finishes.</span></div>}
            {stale && <div className="nm-stale" role="alert">Preview paused · the last frame is shown</div>}
            {state.recording && <span className="nm-rec"><span/>REC</span>}
          </> : <div className="nm-placeholder"><Camera size={44}/><h2>{state.phase === 'connecting' ? 'Connecting to your Nano' : 'Frame your next take'}</h2><p>{state.phase === 'connecting' ? state.message : 'Power on the camera and disconnect DJI Mimo. Connect here to see the complete camera view.'}</p><span>Wireless preview · original videos saved after Stop</span></div>}
        </div>
        <div className="nm-view-footer"><span><span className={`nm-dot ${connected && !stale ? 'is-live' : ''}`}/>{state.recording ? 'Recording on camera' : connected ? 'Nano connected' : 'Camera disconnected'}</span><span>1280 × 720 preview</span>{state.battery !== null && connected && <span>Battery {state.battery}%</span>}</div>
      </section>

      <aside className="nm-controls" aria-label="Recording controls">
        <div className="nm-section-label">YOUR TAKE</div><h2>Frame. Record. Save.</h2><p className="nm-explanation">Watch here while the Nano records the original. Press Stop and we’ll copy it to your selected drive.</p>
        <div className="nm-record-controls">
          <Button className="nm-record-button" disabled={!ready || state.recording || !state.frames || !!busy || state.storage?.available === false} onClick={() => action('start')}><Video size={18}/>Record on Nano</Button>
          <Button className="nm-stop-button" variant="outline" disabled={!ready || !state.recording || !!busy} onClick={() => action('stop')}><Square size={15}/>Stop & save{state.storage?.external ? ' to USB' : ''}</Button>
        </div>
        <div className={`nm-status ${state.error || error ? 'has-error' : ''}`} role="status" aria-live="polite"><p>{error || state.message}</p>{state.progress !== null && <><progress max={100} value={state.progress} aria-label="Copy progress"/><span>{state.progress}% copied</span></>}</div>
        <div className="nm-note"><Wifi size={17}/><p>The camera uses this PC’s Wi-Fi while connected. Disconnect to return to your usual network.</p></div>
        <div className="nm-storage"><label className="nm-section-label" htmlFor="save-drive">STORAGE PREFERENCE</label><p>{state.destination || 'Checking save location…'}</p>
          {state.storage?.free !== null && state.storage?.free !== undefined && <p>{formatSize(state.storage.free)} free{state.storage.filesystem ? ` · ${state.storage.filesystem}` : ''}</p>}
          {state.storage?.error && <p className="nm-storage-error" role="alert">{state.storage.error}</p>}
          <select id="save-drive" value={location ?? state.storage?.selectedId ?? 'auto'} onChange={event => setLocation(event.target.value)} disabled={!idle || state.phase === 'offline' || storageBusy || !!busy}>
            <option value="auto">Automatic · external drive, otherwise D:</option>
            <option value="pc">Always D:\Osmo Nano</option>
            {state.storage && !['pc','auto'].includes(state.storage.selectedId) && !state.storage.volumes.some(volume => volume.id === state.storage?.selectedId) && <option value={state.storage.selectedId}>Preferred USB · disconnected</option>}
            {state.storage?.volumes.map(volume => <option key={volume.id} value={volume.id}>{volume.root} {volume.label || 'USB drive'} · {formatSize(volume.free)} free</option>)}
          </select>
          <div className="nm-storage-actions"><Button variant="outline" disabled={!idle || state.phase === 'offline' || storageBusy || !!busy || !location || location === state.storage?.selectedId} onClick={() => action('storage', {id: location})}>{busy === 'storage' ? 'Saving…' : 'Save preference'}</Button><Button variant="ghost" disabled={state.phase === 'offline' || storageBusy || !!busy} onClick={refreshStorage}>{storageBusy ? 'Finding drives…' : 'Refresh drives'}</Button></div>
          <p>{!idle ? 'Disconnect to change this preference.' : state.storage?.automatic ? 'Automatically checks connected USB drives. Without one, new videos go to D:.' : 'New videos always use your preferred location.'} C: is never used for footage. Edits stay beside the video.</p>
          <Button variant="ghost" onClick={() => action('folder')} disabled={state.phase === 'offline' || !!busy || state.storage?.available === false}><FolderOpen size={16}/>Open video folder</Button></div>
      </aside>
    </div>

    <section className="nm-saved" aria-labelledby="saved-heading"><div className="nm-saved-heading"><div><span className="nm-section-label">YOUR SAVED FILES</span><h2 id="saved-heading">Saved recordings</h2></div><span>{state.saved.length} saved</span></div>
      {state.saved.length ? <ul>{state.saved.slice(0,20).map((video, index) => <li key={`${video.dest_path}-${index}`}><span className="nm-file-icon"><CheckCircle2 size={18}/></span><div><p>{video.original}</p><span>Original camera file · {formatSize(video.size)}</span><span>{video.dest_path}</span></div><Button variant="ghost" onClick={() => action('folder', {savedPath: video.dest_path})} disabled={!!busy || state.phase === 'offline'} aria-label={`Open folder containing ${video.original}`}><FolderOpen size={18}/><span>Show folder</span></Button></li>)}</ul> : <div className="nm-empty"><FolderOpen size={22}/><p>Your next finished take will appear here after it’s copied.</p></div>}
    </section>
    <footer className="nm-footer">Live view is for framing. The saved original keeps your camera’s recording resolution and audio.</footer>
  </main>;
}
