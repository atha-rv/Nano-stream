import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterVideos, selectedFromFilter} from './gallery-model.ts';
const today = new Date(2026,9,11,12);
const videos = Array.from({length:12},(_,index)=>({id:String(index),name:`take-${index}`,size:100,
  recordedAt:new Date(Date.UTC(2026,9,11-index,12)).toISOString().slice(0,19),storage:'internal',alreadySaved:index===0,conflict:index===2}));
videos.push({id:'unknown',name:'custom.MP4',size:100,recordedAt:null,storage:'internal',alreadySaved:false,conflict:false});
test('camera date filters use an inclusive local calendar, with unknown dates explicit',()=>{
  assert.deepEqual(filterVideos(videos,'today',today).map(v=>v.id),['0']);
  assert.equal(filterVideos(videos,'week',today).length,7);
  assert.equal(filterVideos(videos,'five',today).length,5);
  assert.equal(filterVideos(videos,'ten',today).length,10);
  assert.equal(filterVideos(videos,'all',today).at(-1).id,'unknown');
  assert.equal(filterVideos(videos,'range',today,'2026-10-08','2026-10-10').length,3);
  assert.equal(filterVideos(videos,'range',today,'2026-10-10','2026-10-08').length,0);
});
test('batch selection includes valid existing files, excludes conflicts, and allows deselection',()=>{
  const selected=selectedFromFilter(filterVideos(videos,'five',today));
  assert.equal(selected.size,4);assert(selected.has('0'));assert(!selected.has('2'));
  selected.delete('1');assert.equal(selected.size,3);
  selected.clear();assert.equal(selected.size,0);
});
