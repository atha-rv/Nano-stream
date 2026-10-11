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
test('foundation separates white captions from pink marks on white cards',()=>{
  const data=JSON.parse(source.match(/<script id="foundation-data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(data.assets.length,0);
  assert.equal(data.style.colour,'#FFFFFF');
  assert.equal(data.style.graphicBackground,'#FFFFFF');
  assert.equal(data.style.graphicText,'#202020');
  assert.equal(data.style.optionalAccent,'#FF2DAA');
  assert.equal(data.recipes.length,6);
  assert(data.recipes.find(recipe=>recipe.id==='caption').approved);
  assert(data.recipes.filter(recipe=>recipe.id!=='caption').every(recipe=>!recipe.approved));
  assert.equal(data.vectorMarks.check.path,'M20 6 9 17l-5-5');
  assert(data.vectorMarks.check.source.includes('MIT'));
  assert(source.includes("connect-src 'none'"));
});
test('saved foundation can be edited again and excludes transient preview footage',()=>{
  assert(source.includes("clone.querySelector('#save').disabled=false"));
  assert(source.includes("clone.querySelector('#asset-input').disabled=false"));
  assert(source.includes("media.removeAttribute('src');media.hidden=true"));
  new Function(source.split('<script>')[1].split('</script>')[0]);
});
