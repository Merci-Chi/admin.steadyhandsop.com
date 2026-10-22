import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const original=await readFile(new URL('../admin-leads.js',import.meta.url),'utf8');
const source=original.slice(0,original.indexOf("$('alAreaCode').addEventListener"))+`window.api={state,loadRows,targetIds,openAdvanced,leadStageLabel,renderRows};})();`;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const stages=['notstarted','staging','outreach','review','complete','notinterested','archived','callback','donotcall'];
const data=[...stages.map(stage=>({id:stage,stage,company:'Grandma '+stage,phone:'7025550100'})),{id:'null',stage:null,company:'Grandma null',phone:'7025550100'},{id:'empty',stage:'',company:'Grandma empty',phone:'7025550100'}];
function setup(){
 const nodes=new Map(),requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',querySelectorAll:()=>[],classList:{toggle(){}},removeAttribute(){}});return nodes.get(id)};
 const builder=kind=>{
  const req={kind,filters:[]};requests.push(req);
  const q={select(_fields,options){req.options=options;return q},
   eq(k,v){req.filters.push(['eq',k,v]);return q},is(k,v){req.filters.push(['is',k,v]);return q},
   or(v){req.filters.push(['or',v]);return q},order(){return q},abortSignal(){return q},
   range(a,b){req.range=[a,b];return q},limit(n){req.limit=n;return q},
   then(resolve,reject){
    let rows=data.filter(row=>req.filters.every(([op,k,v])=>{
     if(op==='eq'&&k==='stage')return row.stage===v;
     if(op==='or'&&k.startsWith('stage.')){
      assert.equal(k,'stage.eq.notstarted,stage.is.null,stage.eq.""');
      return row.stage==='notstarted'||row.stage===null||row.stage==='';
     }
     return true;
    }));
    const count=rows.length;
    if(req.range)rows=rows.slice(req.range[0],req.range[1]+1);
    if(req.limit)rows=rows.slice(0,req.limit);
    return Promise.resolve({data:rows,count}).then(resolve,reject);
   }};
  return q;
 };
 const window={steadyHandsCRMClient:{from:()=>builder('table'),rpc:()=>builder('area')}};
 vm.runInNewContext(source,{window,document:{getElementById:node},AbortController,setTimeout,clearTimeout,console});
 return {api:window.api,node,requests};
}

test('Not called includes null/empty stages and excludes other stages before pagination, counting and bulk selection',async()=>{
 const s=setup();Object.assign(s.api.state,{stage:'notstarted',size:2});
 await s.api.loadRows();await tick();
 assert.deepEqual(Array.from(s.api.state.rows,r=>r.id),['notstarted','null']);
 assert.equal(s.api.state.total,3);assert.equal(s.api.state.hasMore,true);
 s.api.state.allMatching=true;
 assert.deepEqual(Array.from(await s.api.targetIds()),['notstarted','null','empty']);
 s.api.state.page=2;await s.api.loadRows();
 assert.deepEqual(Array.from(s.api.state.rows,r=>r.id),['empty']);
 assert.match(s.node('alActiveFilters').innerHTML,/Stage: Not called/);
});

test('each stage filters rows and exact totals on normal, text and indexed area-code paths',async()=>{
 for(const stage of stages)for(const extra of [{},{query:'Grandma'},{areaCode:'702'}]){
  const s=setup();Object.assign(s.api.state,{stage,...extra});
  await s.api.loadRows();await tick();
  const expected=stage==='notstarted'?['notstarted','null','empty']:stage==='donotcall'&&extra.query?[]:[stage];
  assert.deepEqual(Array.from(s.api.state.rows,r=>r.id).sort(),expected.sort(),stage+JSON.stringify(extra));
  assert.equal(s.api.state.total,expected.length);
  assert(s.requests.every(r=>r.filters.some(f=>stage==='notstarted'?f[0]==='or'&&f[1].startsWith('stage.'):f[0]==='eq'&&f[1]==='stage'&&f[2]===stage)));
 }
});

test('changing the visible filter clears selection, resets pagination, and All stages restores results',async()=>{
 const s=setup();await s.api.loadRows();
 s.api.state.page=4;s.api.state.selected.add('outreach');s.api.state.allMatching=true;
 s.node('alStage').onchange({target:{value:'callback'}});await tick();
 assert.equal(s.api.state.page,1);assert.equal(s.api.state.selected.size,0);assert.equal(s.api.state.allMatching,false);
 assert.deepEqual(Array.from(s.api.state.rows,r=>r.id),['callback']);
 assert.equal(s.node('alStage').value,'callback');
 assert.match(s.node('alActiveFilters').innerHTML,/Stage: Follow-up/);
 s.node('alStage').onchange({target:{value:''}});await tick();
 assert.equal(s.api.state.total,data.length);assert.equal(s.node('alStage').value,'');
 assert.doesNotMatch(s.node('alActiveFilters').innerHTML,/Stage:/);
});

test('Advanced Filters and visible Stage dropdown stay in sync when applying and clearing',async()=>{
 const s=setup();s.api.openAdvanced();
 assert.match(s.node('alModalBody').innerHTML,/Outreach/);
 s.node('advStage').value='outreach';s.node('advAssignee').value='';
 s.node('alApplyModal').onclick();await tick();
 assert.equal(s.node('alStage').value,'outreach');
 s.api.openAdvanced();assert.match(s.node('alModalBody').innerHTML,/value="outreach" selected/);
 s.node('alClearModal').onclick();await tick();
 assert.equal(s.node('alStage').value,'');
});

 test('called tags cannot display as Not called and terminal results take precedence',()=>{
 const s=setup();
 assert.equal(s.api.leadStageLabel({stage:'notstarted',tags:['Left Voicemail']}),'Outreach');
 assert.equal(s.api.leadStageLabel({stage:'notstarted',tags:['Wrong Number','Left Voicemail']}),'Wrong / invalid number');
 assert.equal(s.api.leadStageLabel({stage:'notstarted',outcome:'Not Interested'}),'Not interested');
 assert.equal(s.api.leadStageLabel({stage:'notstarted'}),'Not called');
 });

test('Call status and Tags render in separate columns without duplicate status tags',()=>{
 const s=setup();s.api.state.rows=[{id:'called',call_status:'Called',stage:'outreach',tags:['Called','Not started','Wrong Number']}];
 s.api.renderRows();const html=s.node('adminLeadList').innerHTML;
 assert.match(html,/data-call-status="Called"/);
 assert.match(html,/Wrong Number/);assert.doesNotMatch(html,/Not started/);
 assert.match(html,/<\/td><td><span class="al-chip">Wrong Number/);
});
