import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const guard=await readFile(new URL('../auth-guard.js',import.meta.url),'utf8');
const login=await readFile(new URL('../login.js',import.meta.url),'utf8');
const verify=login.slice(login.indexOf('  async function verifyAdminAccess'),login.indexOf('  function showRecoveryForm'));
const admin={role:'ADMIN',active:true};
const ok=rows=>({ok:true,json:async()=>rows});
const http=status=>({ok:false,status,text:async()=>status===401?'Expired token':'Temporarily unavailable'});
const timeout=()=>Object.assign(new Error('Timed out'),{name:'AbortError'});
function setup(kind,responses){
 let start,calls=0;const events=[],redirects=[],durations=[],timers=new Set();
 const window={steadyHandsCRMClient:{auth:{getSession:async()=>({data:{session:{user:{id:'user'},access_token:'test-token'}}})}},
  supabase:{},dispatchEvent:event=>events.push(event)};
 const document={readyState:'loading',documentElement:{classList:{add(){},remove(){}}},body:{innerHTML:'',appendChild(element){this.loading=element}},
  createElement(){let html;return {style:{},textContent:'',get innerHTML(){return html??this.textContent},set innerHTML(value){html=value},remove(){this.removed=true}}},
  getElementById(){return {addEventListener(){}}},addEventListener(name,handler){start=handler}};
 const context={window,document,location:{pathname:'/phones.html',replace:path=>redirects.push(path)},
  URLSearchParams,AbortController,TypeError,CustomEvent:class {constructor(type){this.type=type}},
  console:{error(){},warn(){}},url:'https://example.supabase.co',key:'test-key',
  setTimeout(fn,ms){const timer={fn,ms};durations.push(ms);timers.add(timer);return timer},clearTimeout:timer=>timers.delete(timer),
  fetch:async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer test-token');assert(options.signal);
   const response=responses[Math.min(calls++,responses.length-1)];
   if(response instanceof Error)throw response;
   return response;
  }};
 vm.createContext(context);
 if(kind==='guard')vm.runInContext(guard,context);
 else vm.runInContext(verify+';window.verify=verifyAdminAccess;',context);
 return {window,document,events,redirects,durations,timers,get calls(){return calls},
  run:()=>kind==='guard'?start():window.verify({id:'user'},'test-token')};
}
test('guard displays loading status while checking access and removes it only after verification',async()=>{
 const s=setup('guard',[ok([admin])]);let resolve;
 s.window.steadyHandsCRMClient.auth.getSession=()=>new Promise(r=>resolve=r);
 const pending=s.run();assert.match(s.document.body.loading.innerHTML,/Checking administrator access/);
 assert.equal(s.events.length,0);assert.equal(s.document.body.loading.removed,undefined);
 resolve({data:{session:{user:{id:'user'},access_token:'test-token'}}});await pending;
 assert.equal(s.document.body.loading.removed,true);assert.equal(s.events[0]?.type,'steadyhands:admin-ready');
});
for(const kind of ['guard','login']){
 for(const failure of [timeout(),new TypeError('Failed to fetch'),http(503),http(429)])test(`${kind} recovers a transient permission failure without changing credentials`,async()=>{
  const s=setup(kind,[failure,ok([admin])]);const allowed=await s.run();
  assert.equal(s.calls,2);assert(s.durations.filter(ms=>ms!==30000).every(ms=>ms===15000));assert.equal(s.timers.size,0);
  if(kind==='guard'){assert.equal(s.events[0]?.type,'steadyhands:admin-ready');assert.equal(s.window.steadyHandsAdminSession.permission.active,true);}
  else assert.equal(allowed,true);
 });
 test(`${kind} stops retrying and fails closed after three timeouts`,async()=>{
  const s=setup(kind,[timeout()]);
  if(kind==='guard'){await s.run();assert.equal(s.events.length,0);assert.equal(s.window.steadyHandsAdminSession,undefined);assert.match(s.document.body.innerHTML,/three attempts/);}
  else await assert.rejects(s.run(),/three attempts/);
  assert.equal(s.calls,3);assert.equal(s.timers.size,0);
 });
 test(`${kind} never retries an expired token or grants access`,async()=>{
  const s=setup(kind,[http(401),ok([admin])]);
  if(kind==='guard'){await s.run();assert.equal(s.events.length,0);assert.match(s.document.body.innerHTML,/401/);}
  else await assert.rejects(s.run(),/401/);
  assert.equal(s.calls,1);
 });
 for(const permission of [[],[{role:'SALES',active:true}],[{role:'ADMIN',active:false}]])test(`${kind} requires a fresh active ADMIN permission: ${JSON.stringify(permission)}`,async()=>{
  const s=setup(kind,[ok(permission),ok([admin])]);const allowed=await s.run();assert.equal(s.calls,1);
  if(kind==='guard'){assert.equal(s.events.length,0);assert.equal(s.window.steadyHandsAdminSession,undefined);assert.match(s.document.body.innerHTML,/Unauthorized/);}
  else assert.equal(allowed,false);
 });
}
