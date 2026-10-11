'use client';
import {useEffect, useRef, useState} from 'react';
import {Button} from '@kit/ui/button';
import {Download, RefreshCw, Video, X, FolderOpen} from 'lucide-react';
import {cameraRequest, thumbnailUrl} from './camera-client';
import {CameraVideo, GalleryFilter, filterLabels, filterVideos, localDate, selectedFromFilter} from './gallery-model';

type Gallery = {status: string; items: CameraVideo[]; complete: boolean; warning: string | null; revision: number; pages: number; thumbnailSession?: number};
export type DownloadBatch = {path: string; label: string; status: string; count: number; selectedCount: number; createdAt: string};
type Transfer = {totalFiles: number; doneFiles: number; selectedCount: number; currentName: string; bytesDone: number; totalBytes: number};
type Props = {open: boolean; onClose: () => void; phase: string; recording: boolean; destination: string; storageAvailable: boolean;
  error: string | null; progress: number | null; transfer?: Transfer | null; batches?: DownloadBatch[];
  action: (name: string, body?: object) => Promise<void>};
const bytes = (value: number) => value >= 1e9 ? `${(value/1e9).toFixed(2)} GB` : `${(value/1e6).toFixed(1)} MB`;

function VideoThumbnail({video, session, retry, open}: {video: CameraVideo; session: number; retry: number; open: boolean}) {
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  return <span className={`nm-gallery-thumbnail nm-gallery-thumbnail-${status}`}>
    {open && status !== 'error' && <img src={thumbnailUrl(video.id, session, retry)} alt="" loading="lazy" decoding="async" onLoad={()=>setStatus('ready')} onError={()=>setStatus('error')}/>}
    {status !== 'ready' && <span className="nm-gallery-thumbnail-placeholder"><Video size={18}/><span>{status==='error'?'No preview':'Loading…'}</span></span>}
  </span>;
}

export function CameraGallery(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [gallery,setGallery] = useState<Gallery>({status:'empty',items:[],complete:false,warning:null,revision:0,pages:0});
  const [filter,setFilter] = useState<GalleryFilter>('today');
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [autoSelect,setAutoSelect] = useState(true);
  const [from,setFrom] = useState(localDate(new Date()));
  const [to,setTo] = useState(localDate(new Date()));
  const [readError,setReadError] = useState<string|null>(null);
  const [requesting,setRequesting] = useState(false);
  const [hasReadGallery,setHasReadGallery] = useState(false);
  const [thumbnailRetry,setThumbnailRetry] = useState(0);
  const actionRef = useRef(props.action); actionRef.current=props.action;
  const autoRequested=useRef(false);
  const ready = ['live','preview_unavailable'].includes(props.phase) && !props.recording;
  const scanning = props.phase === 'cataloguing';
  const copying = props.phase === 'downloading';
  const locked = scanning || copying || requesting;
  const visible=filterVideos(gallery.items,filter,new Date(),from,to);
  const selectedVideos=gallery.items.filter(video=>selected.has(video.id));
  const pending=selectedVideos.filter(video=>!video.alreadySaved);

  useEffect(()=>{const element=dialog.current;if(props.open&&!element?.open)element?.showModal();else if(!props.open&&element?.open)element.close();},[props.open]);
  useEffect(()=>{
    if(!props.open)return;
    let ended=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const response=await cameraRequest('gallery');const data=await response.json();if(!response.ok)throw new Error(data.error);if(!ended){setGallery(previous=>previous.revision===data.revision&&previous.status===data.status?previous:data);setHasReadGallery(true);setReadError(null)}}catch(error){if(!ended)setReadError(error instanceof Error?error.message:'Could not read camera library.')}finally{if(!ended)timer=setTimeout(poll,1000)}};
    void poll();return()=>{ended=true;clearTimeout(timer)};
  },[props.open]);
  useEffect(()=>{
    if(!props.open){autoRequested.current=false;setHasReadGallery(false);return}
    if(hasReadGallery&&ready&&['empty','stale'].includes(gallery.status)&&!autoRequested.current){autoRequested.current=true;void actionRef.current('gallery_refresh')}
  },[props.open,ready,gallery.status,hasReadGallery]);
  useEffect(()=>{
    if(autoSelect)setSelected(selectedFromFilter(filterVideos(gallery.items,filter,new Date(),from,to)));
    else {const valid=new Set(gallery.items.filter(video=>!video.conflict).map(video=>video.id));setSelected(previous=>new Set([...previous].filter(id=>valid.has(id))));}
  },[gallery.items,filter,from,to,autoSelect]);
  async function request(name:string,body?:object){setRequesting(true);try{await props.action(name,body)}finally{setRequesting(false)}}
  function chooseFilter(next:GalleryFilter){setFilter(next);setAutoSelect(true)}
  function toggle(id:string){setAutoSelect(false);setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})}
  const rangeInvalid=filter==='range'&&(!from||!to||from>to);
  const latest=props.batches?.[0]; const disconnected=['disconnected','error'].includes(props.phase); const emptyLibrary=gallery.complete&&!gallery.items.length;
  return <dialog className="nm-gallery-dialog" ref={dialog} onClose={props.onClose} aria-labelledby="camera-gallery-title">
    <div className="nm-gallery-header"><div><span className="nm-section-label">ON YOUR NANO</span><h2 id="camera-gallery-title">Camera videos</h2><p>{gallery.items.length} videos loaded{scanning?' · finding older files…':disconnected?' · cached list — connect to refresh':gallery.complete?' · library scan complete':' · refresh to check the library'}</p></div><Button variant="ghost" onClick={props.onClose} aria-label="Close camera gallery"><X size={22}/></Button></div>
    <div className="nm-gallery-content">
      <div className="nm-gallery-filters" aria-label="Quick video filters">{(Object.keys(filterLabels) as GalleryFilter[]).map(value=><Button key={value} variant="outline" aria-pressed={filter===value} onClick={()=>chooseFilter(value)} disabled={copying}>{filterLabels[value]}</Button>)}</div>
      {filter==='range'&&<div className="nm-gallery-dates"><label>From<input type="date" value={from} onChange={event=>{setFrom(event.target.value);setAutoSelect(true)}} disabled={copying}/></label><label>Through<input type="date" value={to} onChange={event=>{setTo(event.target.value);setAutoSelect(true)}} disabled={copying}/></label>{rangeInvalid&&<p role="alert">Choose a valid date range with From before Through.</p>}</div>}
      <p className="nm-gallery-help">Filters select matching videos. Untick any you don't want, or clear and choose individually. Dates follow the camera clock; unknown dates appear under All.</p>
      {(props.error||readError)&&<p className="nm-gallery-error" role="alert">{props.error||readError}</p>}
      {gallery.warning&&<p className="nm-gallery-warning" role="status">{gallery.warning}</p>}
      {props.recording&&<p className="nm-gallery-warning">Stop recording before loading or downloading videos. The original will stay on the Nano.</p>}
      <div className="nm-gallery-selection"><div><Button variant="ghost" disabled={copying||!visible.length} onClick={()=>{setAutoSelect(false);setSelected(previous=>new Set([...previous,...selectedFromFilter(visible)]))}}>Select all shown</Button><Button variant="ghost" disabled={copying||!selected.size} onClick={()=>{setAutoSelect(false);setSelected(new Set())}}>Clear selection</Button><span>{visible.length} shown · {selected.size} selected</span></div><div className="nm-gallery-refresh-actions">{visible.length>0&&<Button variant="ghost" disabled={!ready||locked} onClick={()=>setThumbnailRetry(value=>value+1)}>Retry previews</Button>}{disconnected&&gallery.items.length?<Button variant="outline" disabled={requesting} onClick={()=>request('connect')}>Connect Nano & refresh</Button>:<Button variant="outline" disabled={!ready||locked} onClick={()=>{autoRequested.current=true;void request('gallery_refresh')}}><RefreshCw size={15}/>Refresh library</Button>}</div></div>
      {gallery.status==='empty'&&!scanning?<div className="nm-gallery-empty"><Video size={30}/><h3>Browse the videos on your camera</h3><p>Connect the Nano to load its library. You can select older videos as well as new recordings.</p>{['disconnected','error'].includes(props.phase)?<Button className="nm-connect" onClick={()=>request('connect')} disabled={requesting}>Connect Nano & load videos</Button>:<Button variant="outline" onClick={()=>request('gallery_refresh')} disabled={!ready||requesting}>Load camera library</Button>}</div>:
        !visible.length?<div className="nm-gallery-empty" role="status"><Video size={30}/><h3>{scanning?'Loading camera videos…':emptyLibrary?'No videos on the camera':'No videos match this filter'}</h3><p>{scanning?'You can select videos as pages arrive. Wait for the scan to finish before downloading.':emptyLibrary?'Record a take on the Nano, or refresh if you expected videos here.':'Try All videos or another date range. If the camera clock is wrong, date filters will reflect that.'}</p></div>:
        <ul className="nm-gallery-list" aria-label="Videos available on the camera">{visible.map(video=><li key={video.id}><label><input type="checkbox" checked={selected.has(video.id)} onChange={()=>toggle(video.id)} disabled={copying||video.conflict}/><VideoThumbnail key={`${video.id}:${gallery.thumbnailSession}:${thumbnailRetry}`} video={video} session={gallery.thumbnailSession||0} retry={thumbnailRetry} open={props.open}/><span className="nm-gallery-video-info"><strong>{video.name}</strong><span>{video.recordedAt?video.recordedAt.replace('T',' · '):'Recording date unknown'} · {bytes(video.size)} · {video.storage==='sd'?'Dock SD':'Internal storage'}</span><span className={video.conflict?'nm-gallery-conflict':''}>{video.conflict?'Different-size local file exists. Move it aside before retrying.':video.alreadySaved?'Already at this destination · included in the editing batch':'Original stays on the camera'}</span></span></label></li>)}</ul>}
      {latest&&<div className="nm-gallery-batch"><div><strong>{latest.status==='complete'?'Editing batch ready':latest.status==='cancelled'?'Partial batch kept':'Check partial batch'}</strong><p>{latest.label} · {latest.count} of {latest.selectedCount} videos available locally</p><p>{latest.path}</p><p>Give this batch.json to the editor for a YouTube edit plus Reels from the whole dump.</p></div><Button variant="outline" onClick={()=>request('folder',{batchPath:latest.path})} disabled={requesting}><FolderOpen size={16}/>Open batch folder</Button></div>}
    </div>
    <div className="nm-gallery-footer"><div><strong>{copying?`Copying ${props.transfer?.doneFiles||0} of ${props.transfer?.totalFiles||pending.length} videos`:scanning?'Loading library…':`${selected.size} video${selected.size===1?'':'s'} selected`}</strong><p>{copying?props.transfer?.currentName||'Preparing transfer…':`${bytes(pending.reduce((sum,video)=>sum+video.size,0))} to copy · ${selectedVideos.length-pending.length} already here`}</p><p className="nm-gallery-destination">Saving to {props.destination||'the selected footage drive'}</p>{copying&&props.progress!==null&&<progress value={props.progress} max={100} aria-label="Selected videos download progress"/>}{!props.storageAvailable&&<p className="nm-gallery-error">Save location unavailable. Reconnect the drive or disconnect and change the preference.</p>}</div><div className="nm-gallery-download-actions">{(scanning||copying)&&<Button variant="outline" onClick={()=>request('cancel')} disabled={requesting}>Cancel {copying?'download':'scan'}</Button>}<Button className="nm-connect" disabled={!ready||locked||!selected.size||!props.storageAvailable||rangeInvalid} onClick={()=>request('download',{ids:[...selected],label:(!autoSelect?'Custom selection · ':'')+(filter==='range'?`${from} to ${to}`:filterLabels[filter])})}><Download size={18}/>{copying?'Downloading…':`Download ${selected.size||'selected'} video${selected.size===1?'':'s'}`}</Button></div></div>
  </dialog>;
}
