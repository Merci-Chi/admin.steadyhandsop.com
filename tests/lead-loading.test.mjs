import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../admin-leads.js',import.meta.url),'utf8');
const source=original.slice(0,original.indexOf("$('adminLeadSearch').addEventListener"))+`window.api={state,query,loadRows,initialize,renderSelection};})();`;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup({rows=()=>({data:[{id:'grandma',company:'Grandma',phone:'+17024802338',assigned_user_id:'agent'}]}),count=()=>({count:1}),total=()=>({count:100})}={}){
 const nodes=new Map(),requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,querySelectorAll(){return []},classList:{toggle(){}}});return nodes.get(id);};
 const client={from(table){const req={table,filters:[],sort:[]};requests.push(req);const q={
  select(fields,options){Object.assign(req,{fields,options});return q;},
  eq(k,v){req.filters.push(['eq',k,v]);return q;},is(k,v){req.filters.push(['is',k,v]);return q;},
  or(value){req.filters.push(['or',value]);return q;},ilike(k,v){req.filters.push(['ilike',k,v]);return q;},contains(k,v){req.filters.push(['contains',k,v]);return q;},
  order(k,v){req.sort.push([k,v]);return q;},range(start,end){req.range=[start,end];return q;},abortSignal(signal){req.signal=signal;return q;},
  then(resolve,reject){return Promise.resolve(table==='callcenter_profiles'?{data:[]}:req.options?.head?(req.filters.length?count(req):total(req)):rows(req)).then(resolve,reject);}
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
test('new search aborts old requests and stale rows never overwrite current results',async()=>{
 const old=deferred(),s=setup({rows:req=>req.filters.some(f=>String(f[1]).includes('%old%'))?old.promise:{data:[{id:'new',company:'New result'}]}});
 s.api.state.query='old';const first=s.api.loadRows();await tick();const firstRequest=s.requests.find(r=>r.range);
 s.api.state.query='new';await s.api.loadRows();await tick();assert(firstRequest.signal.aborted);
 old.resolve({data:[{id:'old',company:'Old result'}]});await first;
 assert.match(s.node('adminLeadList').innerHTML,/New result/);assert.doesNotMatch(s.node('adminLeadList').innerHTML,/Old result/);
});
test('a stale count is aborted and cannot overwrite a newer search total',async()=>{
 const old=deferred(),s=setup({count:req=>req.filters.some(f=>String(f[1]).includes('%old%'))?old.promise:{count:2}});
 s.api.state.query='old';await s.api.loadRows();await tick();const oldCount=s.requests.find(r=>r.options?.head);
 s.api.state.query='new';await s.api.loadRows();await tick();assert(oldCount.signal.aborted);assert.equal(s.api.state.total,2);
 old.resolve({count:999});await tick();assert.equal(s.api.state.total,2);
});
test('rows and exact counts share assignment, archive, facet, and search filters',async()=>{
 const s=setup();Object.assign(s.api.state,{assignee:'agent',query:'grandma',tags:['Interested'],sources:['Manual'],stage:'outreach'});
 await s.api.loadRows();await tick();const page=s.requests.find(r=>r.range),count=s.requests.find(r=>r.options?.head);
 assert.deepEqual(page.filters,count.filters);assert(page.filters.some(f=>f[0]==='eq'&&f[1]==='assigned_user_id'&&f[2]==='agent'));
 assert(page.filters.some(f=>f[1]==='admin_archived.eq.false,admin_archived.is.null'));assert.equal(count.sort.length,0);
 assert(page.filters.some(f=>String(f[1]).includes('notes.ilike.%grandma%')));
 s.api.state.assignee='unassigned';await s.api.loadRows();assert(s.requests.filter(r=>r.range).at(-1).filters.some(f=>f[0]==='is'&&f[1]==='assigned_user_id'&&f[2]===null));
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
