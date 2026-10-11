const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(`${__dirname}/editing-foundation.html`,'utf8');
const serializer=source.match(/function foundationJSON\(value\)\{[^\n]+?\}/)[0];
const foundationJSON=vm.runInNewContext(`(${serializer})`);
test('saved embedded JSON cannot end its script and preserves approvals/notes',()=>{
  const state={notes:'</script><script>alert("x")</script> & café',assets:[
    {name:'reference.png',approved:true,note:'Keep the white type',data:'data:image/png;base64,YQ=='},
    {name:'pending.png',approved:false,note:'Reference only'}]};
  const encoded=foundationJSON(state);
  assert(!encoded.includes('<'));
  assert.deepEqual(JSON.parse(encoded),state);
  const document=`<script type="application/json">${encoded}</script>`;
  assert.equal((document.match(/<\/script>/g)||[]).length,1);
});
test('public foundation starts empty with white default and no bundled Helvetica',()=>{
  const data=JSON.parse(source.match(/<script id="foundation-data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(data.previewMode,'white');assert.equal(data.assets.length,0);
  assert.equal(data.style.optionalAccent,'#FF2DAA');
  assert(source.includes("connect-src 'none'"));
});
