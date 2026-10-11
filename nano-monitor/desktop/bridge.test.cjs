const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateRequest} = require('./bridge.cjs');

test('camera IPC exposes only supported actions and storage preferences', () => {
  for (const [action, method, body] of [['state','GET'], ['storage','GET'], ['storage','POST',{id:'auto'}], ['start','POST'], ['stop','POST'], ['folder','POST',{savedPath:'E:\\Osmo Nano\\take.mp4'}]]) {
    assert.doesNotThrow(() => validateRequest(action, method, body));
  }
  for (const request of [['execute','POST',{command:'cmd'}], ['state','POST'], ['start','GET'], ['storage','POST'], ['storage','POST',{path:'C:\\'}], ['folder','POST',{savedPath:'x', command:'anything'}], ['stop','POST',{id:'auto'}], ['close','POST']]) {
    assert.throws(() => validateRequest(...request));
  }
});

test('gallery downloads accept IDs only, never renderer-supplied paths or records', () => {
  assert.doesNotThrow(() => validateRequest('gallery','GET'));
  assert.doesNotThrow(() => validateRequest('gallery_refresh','POST'));
  assert.doesNotThrow(() => validateRequest('cancel','POST'));
  assert.doesNotThrow(() => validateRequest('download','POST',{ids:['a'.repeat(24)],label:'Today'}));
  assert.doesNotThrow(() => validateRequest('folder','POST',{batchPath:'E:\\batch.json'}));
  for (const body of [undefined, {ids:[]}, {ids:['../file']}, {ids:['a'.repeat(24)], path:'C:\\'}, {ids:['a'.repeat(24)],label:'x'.repeat(81)}, {ids:new Array(10001).fill('a'.repeat(24))}]) {
    assert.throws(() => validateRequest('download','POST',body));
  }
});
