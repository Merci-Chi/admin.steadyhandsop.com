import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../admin-leads.js',import.meta.url),'utf8');
const source=original.slice(0,original.indexOf("$('alAreaCode').addEventListener"))+`window.api={state,query,loadRows,initialize,renderSelection,targetIds};})();`;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup({indexed=()=>({error:{message:'Indexed lookup unavailable'}}),rows=()=>({data:[{id:'grandma',company:'Grandma',phone:'+17024802338',assigned_user_id:'agent'}]}),count=()=>({count:1}),total=()=>({count:100})}={}){
 const nodes=new Map(),requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,removeAttribute(key){delete this[key]},querySelectorAll(){return []},classList:{toggle(){}}});return nodes.get(id);};
 const client={from(table){const req={table,filters:[],sort:[]};requests.push(req);const q={
  select(fields,options){Object.assign(req,{fields,options});return q;},
  eq(k,v){req.filters.push(['eq',k,v]);return q;},is(k,v){req.filters.push(['is',k,v]);return q;},
  or(value){req.filters.push(['or',value]);return q;},ilike(k,v){req.filters.push(['ilike',k,v]);return q;},contains(k,v){req.filters.push(['contains',k,v]);return q;},
  gt(k,v){req.filters.push(['gt',k,v]);return q;},limit(value){req.limit=value;return q;},
  order(k,v){req.sort.push([k,v]);return q;},range(start,end){req.range=[start,end];return q;},abortSignal(signal){req.signal=signal;return q;},
  then(resolve,reject){return Promise.resolve(table==='callcenter_profiles'?{data:[]}:req.options?.head?(req.filters.length?count(req):total(req)):req.options?.count==='exact'?indexed(req):rows(req)).then(resolve,reject);}
 };return q;}};
 const window={steadyHandsCRMClient:client};vm.runInNewContext(source,{window,document:{getElementById:node},AbortController,console:{error(){},warn(){}},setTimeout,clearTimeout,alert(){}});
 return {api:window.api,node,requests};
}
test('Grandma renders before slow matching or global counts finish; All includes assigned leads',async()=>{
 const pending=deferred(),s=setup({count:()=>pending.promise,total:()=>pending.promise});let initialized=false;
 s.api.initialize().then(()=>initialized=true);await tick();assert(initialized);
 assert.match(s.node('adminLeadList').innerHTML,/Grandma/);assert.equal(s.node('alAssignedLabel').textContent,'Assigned: All');
 const page=s.requests.find(r=>r.table==='crm'&&r.range);assert.equal(page.options,undefined);assert.deepEqual(page.range,[0,10]);
 assert(!page.filters.some(f=>f[1]==='assigned_user_id'));assert.match(s.node('alPageStatus').textContent,/Counting matches/);
 pending.resolve({count:1});await tick();
});
test('a timed-out exact count keeps rows and usable Next navigation',async()=>{
 const s=setup({rows:()=>({data:Array.from({length:11},(_,i)=>({id:String(i),company:'Client '+i}))}),count:()=>({error:{code:'57014',message:'statement timeout'}})});
 await s.api.loadRows();await tick();assert.equal(s.api.state.rows.length,10);assert(s.api.state.hasMore);
 assert.match(s.node('adminLeadList').innerHTML,/Client 0/);assert.doesNotMatch(s.node('adminLeadList').innerHTML,/Client 10/);
 assert.match(s.node('alPageStatus').textContent,/Showing 1–10 · Total unavailable/);
 assert.match(s.node('alPageButtons').innerHTML,/data-page="2"[^>]*>›/);assert.equal(s.node('alSelectAllMatching').hidden,true);
});
test('the look-ahead row correctly disables Next on a final partial page',async()=>{
 const s=setup({rows:()=>({data:[{id:'last',company:'Last client'}]}),count:()=>({error:{message:'count failed'}})});
 s.api.state.page=2;await s.api.loadRows();await tick();assert.equal(s.api.state.hasMore,false);
 assert.match(s.node('alPageButtons').innerHTML,/data-page="3" disabled[^>]*>›/);assert.match(s.node('alPageStatus').textContent,/Showing 11–11/);
});
test('new search aborts a running scan and stale batches never overwrite results',async()=>{
 const old=deferred();let calls=0;
 const s=setup({rows:()=>++calls===1?old.promise:{data:[{id:'new',company:'New result'}]}});
 s.api.state.query='old';const first=s.api.loadRows();await tick();const firstRequest=s.requests.find(r=>r.limit);
 s.api.state.query='new';await s.api.loadRows();assert(firstRequest.signal.aborted);
 old.resolve({data:[{id:'old',company:'Old result'}]});await first;
 assert.match(s.node('adminLeadList').innerHTML,/New result/);assert.doesNotMatch(s.node('adminLeadList').innerHTML,/Old result/);
});
test('a stale scan total cannot overwrite a completed newer search',async()=>{
 const old=deferred();let counts=0;
 const s=setup({count:()=>++counts===1?old.promise:{count:99},rows:()=>({data:[{id:'1',company:'New result'}]})});
 s.api.state.query='old';await s.api.loadRows();const oldCount=s.requests.find(r=>r.options?.head);
 s.api.state.query='new';await s.api.loadRows();assert(oldCount.signal.aborted);assert.equal(s.api.state.total,1);
 old.resolve({count:999});await tick();assert.equal(s.api.state.total,1);
 assert.match(s.node('alSearchProgressText').textContent,/1 of 1 leads searched · 1 matches · Complete/);
});
test('scan batches and denominator share facets, assignment and archive without expensive text OR',async()=>{
 const s=setup();Object.assign(s.api.state,{assignee:'agent',query:'grandma',tags:['Interested'],sources:['Manual'],stage:'outreach'});
 await s.api.loadRows();const page=s.requests.find(r=>r.limit),count=s.requests.find(r=>r.options?.head);
 assert.deepEqual(page.filters,count.filters);assert(page.filters.some(f=>f[0]==='eq'&&f[1]==='assigned_user_id'&&f[2]==='agent'));
 assert(page.filters.some(f=>f[1]==='admin_archived.eq.false,admin_archived.is.null'));assert.equal(count.sort.length,0);
 assert(!page.filters.some(f=>String(f[1]).includes('ilike')));assert.equal(page.sort[0][0],'id');
 s.api.state.assignee='unassigned';await s.api.loadRows();assert(s.requests.filter(r=>r.limit).at(-1).filters.some(f=>f[0]==='is'&&f[1]==='assigned_user_id'&&f[2]===null));
});
test('select all matching is available only after an exact count succeeds',async()=>{
 const pending=deferred(),s=setup({count:()=>pending.promise});await s.api.loadRows();s.api.state.selected.add('grandma');s.api.renderSelection();
 assert.equal(s.node('alSelectAllMatching').hidden,true);pending.resolve({count:20});await tick();assert.equal(s.node('alSelectAllMatching').hidden,false);
});
test('a row timeout stops Loading and Retry can recover',async()=>{
 let failed=true;const s=setup({rows:()=>failed?{error:{code:'57014',message:'statement timeout'}}:{data:[{id:'grandma',company:'Grandma'}]}});
 await s.api.loadRows();assert.match(s.node('adminLeadList').innerHTML,/Search took too long/);assert.equal(s.node('alPageStatus').textContent,'Could not load this page.');
 failed=false;await s.node('alRetryLoad').onclick();await tick();assert.match(s.node('adminLeadList').innerHTML,/Grandma/);assert.doesNotMatch(s.node('alPageStatus').textContent,/Loading/);
});

test('large page sizes fetch a look-ahead row despite the PostgREST response cap',async()=>{
 const s=setup({rows:req=>({data:Array.from({length:req.range[1]-req.range[0]+1},(_,i)=>({id:String(req.range[0]+i),company:'Client'}))}),count:()=>({error:{message:'count unavailable'}})});
 s.api.state.size=1000;await s.api.loadRows();await tick();
 assert.equal(s.api.state.rows.length,1000);assert(s.api.state.hasMore);assert.equal(new Set(s.api.state.rows.map(r=>r.id)).size,1000);
 const requests=s.requests.filter(r=>r.range);assert.deepEqual(requests.map(r=>r.range),[[0,499],[500,999],[1000,1000]]);
});

test('batch search reports scanned/total, finds notes matches, and paginates cached results',async()=>{
 const second=deferred();
 const data=Array.from({length:253},(_,i)=>({id:String(i).padStart(4,'0'),company:i%2?'Other':'Grandma '+i,notes:i===251?'grandma called':'',created:i===252?null:'2026-10-17'}));
 const s=setup({count:()=>({count:253}),rows:req=>req.filters.some(f=>f[0]==='gt')?second.promise:{data:data.slice(0,250)}});
 s.api.state.query='grandma';const pending=s.api.loadRows();await tick();
 assert.match(s.node('alSearchProgressText').textContent,/250 of 253 leads searched · 125 matches/);
 assert(s.node('alSearchProgressBar').value<100);assert.equal(s.api.state.totalKnown,false);
 assert.match(s.node('adminLeadList').innerHTML,/Grandma/);
 const next=s.requests.find(r=>r.filters.some(f=>f[0]==='gt'));assert.equal(next.filters.at(-1)[2],'0249');
 second.resolve({data:data.slice(250)});await pending;
 assert.match(s.node('alSearchProgressText').textContent,/253 of 253 leads searched · 128 matches · Complete/);
 assert.equal(s.node('alSearchProgressBar').value,100);assert.equal(s.api.state.total,128);
 const before=s.requests.length;s.api.state.page=2;await s.api.loadRows(true);assert.equal(s.requests.length,before);assert.equal(s.api.state.rows.length,10);
 s.api.state.allMatching=true;const ids=await s.api.targetIds();assert.equal(ids.length,128);assert(ids.includes('0251'));assert.equal(s.requests.length,before);
});
test('a database timeout reduces the batch and resumes from the same cursor',async()=>{
 let calls=0;
 const s=setup({rows:()=>++calls===1?{error:{code:'57014',message:'statement timeout'}}:{data:[{id:'1',company:'Grandma'}]}});
 s.api.state.query='grandma';await s.api.loadRows();
 assert.deepEqual(s.requests.filter(r=>r.limit).map(r=>r.limit),[250,125]);
 assert.equal(s.api.state.total,1);assert.equal(s.node('alSearchProgressBar').value,100);
 assert.doesNotMatch(s.node('adminLeadList').innerHTML,/Search took too long/);
});
test('a failed denominator leaves progress indeterminate until a scan completes',async()=>{
 const pending=deferred(),s=setup({count:()=>({error:{code:'57014'}}),rows:()=>pending.promise});
 s.api.state.query='missing';const run=s.api.loadRows();await tick();
 assert.match(s.node('alSearchProgressText').textContent,/0 of …/);assert.equal(s.node('alSearchProgressBar').value,undefined);
 pending.resolve({data:[]});await run;assert.match(s.node('alSearchProgressText').textContent,/0 of 0 leads searched · 0 matches · Complete/);
});

test('timeouts after a completed batch retry its cursor without losing or duplicating matches',async()=>{
 const data=Array.from({length:250},(_,i)=>({id:i+1,company:'Grandma'}));
 // Replace the second response with a transient timeout.
 let afterCursor=0;
 const retry=setup({rows:req=>!req.filters.some(f=>f[0]==='gt')?{data}:++afterCursor===1?{error:{code:'57014'}}:{data:[{id:1000,company:'Grandma'}]}});
 retry.api.state.query='grandma';await retry.api.loadRows();
 assert.equal(retry.api.state.total,251);
 const cursors=retry.requests.filter(r=>r.limit&&r.filters.some(f=>f[0]==='gt')).map(r=>r.filters.at(-1)[2]);
 assert.deepEqual(cursors,[250,250]);assert.match(retry.node('alSearchProgressText').textContent,/251 of 251/);
});
test('editing a search cancels its retry delay and prevents more old requests',async()=>{
 let fail=true;const s=setup({rows:()=>fail?{error:{code:'57014'}}:{data:[{id:'1',company:'New'}]}});
 s.api.state.query='old';const old=s.api.loadRows();await tick();
 assert.match(s.node('alSearchProgressText').textContent,/Retrying smaller batch/);
 fail=false;s.api.state.query='new';await s.api.loadRows();await old;
 assert.equal(s.requests.filter(r=>r.limit).length,2);assert.equal(s.api.state.total,1);
});

test('a complete indexed result wins without finishing a full scan and pagination is cached',async()=>{
 const pending=deferred(),s=setup({rows:()=>pending.promise,indexed:()=>({data:[{id:'g',company:'Grandma'}],count:1})});
 s.api.state.query='grandma';const run=s.api.loadRows();await tick();
 assert.equal(s.api.state.total,1);assert.match(s.node('adminLeadList').innerHTML,/Grandma/);
 assert.match(s.node('alSearchProgressText').textContent,/1 matches found · Complete/);
 const scan=s.requests.find(r=>r.limit);assert(scan.signal.aborted);
 const fast=s.requests.find(r=>r.options?.count==='exact'&&!r.options.head);assert.equal(fast.sort.length,0);
 assert(fast.filters.some(f=>String(f[1]).includes('notes.ilike.%grandma%')));
 pending.resolve({data:[{id:'old',company:'Old result'}]});await run;
 assert.doesNotMatch(s.node('adminLeadList').innerHTML,/Old result/);
 const before=s.requests.length;await s.api.loadRows(true);assert.equal(s.requests.length,before);
});
test('a truncated indexed response cannot masquerade as complete results',async()=>{
 const s=setup({rows:()=>({data:[{id:'real',company:'Grandma actual'}]}),indexed:()=>({data:[{id:'partial',company:'Partial'}],count:501})});
 s.api.state.query='grandma';await s.api.loadRows();assert.equal(s.api.state.total,1);
 assert.match(s.node('adminLeadList').innerHTML,/Grandma actual/);assert.doesNotMatch(s.node('alSearchProgressText').textContent,/matches found/);
});
test('an indexed timeout leaves the progressive search running',async()=>{
 const s=setup({indexed:()=>({error:{code:'57014'}})});s.api.state.query='grandma';await s.api.loadRows();
 assert.match(s.node('adminLeadList').innerHTML,/Grandma/);assert.match(s.node('alSearchProgressText').textContent,/Complete/);
});

test('a late quick lookup cannot overwrite a newer completed search',async()=>{
 const old=deferred();let calls=0;
 const s=setup({indexed:()=>++calls===1?old.promise:{error:{code:'57014'}},rows:()=>({data:[{id:'new',company:'New result'}]})});
 s.api.state.query='old';await s.api.loadRows();s.api.state.query='new';await s.api.loadRows();
 old.resolve({data:[{id:'old',company:'Old result'}],count:1});await tick();
 assert.match(s.node('adminLeadList').innerHTML,/New result/);assert.doesNotMatch(s.node('adminLeadList').innerHTML,/Old result/);
});

test('area code matches normalized primary/alternate phones, never arbitrary digits',async()=>{
 const data=[
  {id:'plain',phone:'9703286093'},
  {id:'formatted',phone:'(970) 867-2131'},
  {id:'country',phone:'+1 (970) 856-9440'},
  {id:'countryPlain',phone:'19705241074'},
  {id:'extension',phone:'970-327-0555 ext. 42'},
  {id:'alternate',phone:'6158597090',altphone:'+1 970 875 8606'},
  {id:'suffix',phone:'9126017970'},
  {id:'middle',phone:'6158597090'},
  {id:'notes',phone:null,notes:'970'},
  {id:'short',phone:'9701234'},
  {id:'foreign',phone:'+44 970 123 4567'},
 ];
 const s=setup({rows:()=>({data})});s.api.state.areaCode='970';await s.api.loadRows();
 assert.deepEqual(Array.from(s.api.state.rows,r=>r.id).sort(),['alternate','country','countryPlain','extension','formatted','plain']);
 assert(!s.requests.some(r=>r.options?.count==='exact'&&!r.options.head));
 assert.match(s.node('alActiveFilters').innerHTML,/Area code: 970/);
 s.api.state.allMatching=true;
 assert.deepEqual(Array.from(await s.api.targetIds()).sort(),['alternate','country','countryPlain','extension','formatted','plain']);
});
test('area code combines with text search, facets, assignment and archive filters',async()=>{
 const data=[{id:'yes',company:'Plumbing',phone:'9703286093'},{id:'wrong-area',company:'Plumbing',phone:'6158597090'},{id:'wrong-name',company:'Painting',phone:'9708672131'}];
 const s=setup({rows:()=>({data})});Object.assign(s.api.state,{areaCode:'970',query:'plumb',assignee:'agent',tags:['Interested'],filter:'archived'});
 await s.api.loadRows();assert.deepEqual(Array.from(s.api.state.rows,r=>r.id),['yes']);
 const batch=s.requests.find(r=>r.limit),count=s.requests.find(r=>r.options?.head);
 assert.deepEqual(batch.filters,count.filters);
 assert(batch.filters.some(f=>f[0]==='eq'&&f[1]==='assigned_user_id'&&f[2]==='agent'));
 assert(batch.filters.some(f=>f[0]==='eq'&&f[1]==='admin_archived'&&f[2]===true));
 assert(batch.filters.some(f=>String(f[1]).includes('tags.cs.')));
});
test('changing area code invalidates cached matches and clearing restores normal paging',async()=>{
 const s=setup({rows:()=>({data:[{id:'970',phone:'9703286093'},{id:'615',phone:'6158597090'}]})});
 s.api.state.areaCode='970';await s.api.loadRows();
 const before=s.requests.length;await s.api.loadRows(true);assert.equal(s.requests.length,before);
 s.api.state.areaCode='615';await s.api.loadRows(true);assert(s.requests.length>before);
 assert.deepEqual(Array.from(s.api.state.rows,r=>r.id),['615']);
 s.api.state.areaCode='';await s.api.loadRows();assert(s.requests.some(r=>r.range));assert.equal(s.api.state.rows.length,2);
});
test('incomplete or invalid area codes prompt for three digits without querying leads',async()=>{
 for(const areaCode of ['9','97','abc','097','9700']){
  const s=setup();s.api.state.areaCode=areaCode;await s.api.loadRows();
  assert.equal(s.requests.length,0);assert.equal(s.api.state.rows.length,0);
  assert.match(s.node('adminLeadList').innerHTML,/Enter a 3-digit area code/);
  assert.equal(s.api.state.countPending,false);
 }
});
