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
