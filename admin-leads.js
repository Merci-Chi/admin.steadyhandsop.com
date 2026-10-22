(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>window.steadyHandsCRMClient;
const state={rows:[],users:[],page:1,size:10,total:0,totalKnown:false,countPending:false,hasMore:false,totalAll:null,filter:'active',query:'',areaCode:'',assignee:'unassigned',timezone:'',stateCode:'',preview:'',stage:'',sort:'created_desc',tags:[],sources:[],tagMode:'OR',sourceMode:'OR',selected:new Set(),allMatching:false,availableTags:[],availableSources:[],loaded:false,seq:0};
const fields='id,company,name,phone,altphone,email,website,domain,notes,issue,concerns,origin,assigned,assigned_user_id,tags,sources,stage,outcome,do_not_call,callbackdate,callbackat,lastcalled,timezone,state_code,leadpotential,tier,previewurl,sitekey,has_site_preview,admin_archived,admin_archived_at,created';
const isArchived=x=>x.admin_archived===true;
const label=id=>{const u=state.users.find(x=>String(x.user_id)===String(id));return u?(u.display_name||u.email||'Salesperson'):'Unassigned'};
const text=x=>typeof x==='string'?x:'';
const normalizeList=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:typeof x==='object'&&x?(x.label||x.name||x.value||''):'').filter(Boolean):[];
const fmtDate=x=>x?new Date(x).toLocaleString([],{month:'short',day:'numeric',year:'numeric'}):'—';
const icon=()=>window.lucide?.createIcons?.();
const fmtNum=n=>Number(n||0).toLocaleString();
const stageLabel=value=>({notstarted:'Not started',staging:'Staging',outreach:'Called / outreach',review:'Review',complete:'Complete',notinterested:'Not interested',archived:'Archived',callback:'Follow-up',donotcall:'Do not call'})[String(value||'').toLowerCase()]||value||'Not started';
const filterStages=['notstarted','staging','outreach','review','complete','notinterested','archived','callback','donotcall'];
const stageOptions=selected=>`<option value="">All stages</option>`+filterStages.map(value=>`<option value="${value}" ${selected===value?'selected':''}>${esc(stageLabel(value))}</option>`).join('');
const errorMessage=e=>[e?.message,e?.details,e?.hint,e?.code&&('Code: '+e.code)].filter(Boolean).join(' — ')||'The leads request failed without an error message. Open System → Leads → View Error for database details.';
const showError=e=>{console.error('All Leads:',e);alert(errorMessage(e))};
let rowsController=null,countController=null,searchCache=null;
const searchColumns=['company','name','phone','altphone','email','website','notes','state_code','timezone'];
const searchTerm=()=>state.query.replace(/[(),.%_*\\]/g,' ').trim().toLowerCase();
// Keep legacy disposition markers consistent with the outreach app.
const isDoNotCall=row=>row.do_not_call===true||[row.stage,row.outcome,...normalizeList(row.tags)]
 .some(value=>['donotcall','donotcontact','dnc'].includes(String(value??'').toLowerCase().replace(/[^a-z]/g,'')));
// Normalize NANP phone numbers, allowing a country code and a trailing extension.
function phoneAreaCode(value){
 const main=String(value??'').split(/(?:extension|ext\.?|x|#|;ext=)/i)[0];
 let digits=main.replace(/\D/g,'');
 if(digits.length===11&&digits.startsWith('1'))digits=digits.slice(1);
 return /^[2-9]\d{9}$/.test(digits)?digits.slice(0,3):'';
}
function matchesSearch(row,term){
 return !isDoNotCall(row)&&(!state.areaCode||[row.phone,row.altphone].some(phone=>phoneAreaCode(phone)===state.areaCode))
  &&(!term||searchColumns.some(column=>String(row[column]??'').toLowerCase().includes(term)));
}
function query(base=client().from('crm').select(fields),opts={}){
 let q=base;
 // Preserve NULL (unmarked) leads. Apply to lookup, scan and scan count alike.
 if(searchTerm()||state.areaCode)q=q.or('do_not_call.eq.false,do_not_call.is.null');
 if(state.filter==='active')q=q.or('admin_archived.eq.false,admin_archived.is.null');
 if(state.filter==='archived')q=q.eq('admin_archived',true);
 if(state.assignee==='unassigned')q=q.is('assigned_user_id',null);
 else if(state.assignee)q=q.eq('assigned_user_id',state.assignee);
 if(state.timezone)q=q.eq('timezone',state.timezone);
 if(state.stateCode)q=q.ilike('state_code',state.stateCode);
 // Empty stages render as Not started, so include them in that filter.
 if(state.stage==='notstarted')q=q.or('stage.eq.notstarted,stage.is.null,stage.eq.""');
 else if(state.stage)q=q.eq('stage',state.stage);
 if(state.preview==='yes')q=q.eq('has_site_preview',true);
 if(state.preview==='no')q=q.eq('has_site_preview',false);
 // CRM tags and sources are JSONB arrays, not PostgreSQL text[] columns.
 // JSONB supports @> (cs) containment; PostgreSQL array overlap (ov) is invalid here.
 const jsonFacet=(column,values,mode)=>{
   if(!values.length)return;
   if(mode==='AND'){q=q.contains(column,values);return;}
   const clauses=values.map(value=>`${column}.cs.${JSON.stringify([value])}`);
   q=q.or(clauses.join(','));
 };
 jsonFacet('tags',state.tags,state.tagMode);
 jsonFacet('sources',state.sources,state.sourceMode);
 const search=state.query.trim();
 if(search&&!opts.skipSearch){const safe=search.replace(/[(),.%_*\\]/g,' ').trim();if(safe){const pat=`%${safe}%`;q=q.or(searchColumns.map(col=>`${col}.ilike.${pat}`).join(','));}}
 if(!opts.noSort){const [key,dir]=state.sort.split('_');q=q.order(key,{ascending:dir==='asc',nullsFirst:false}).order('id',{ascending:true})}
 return q;
}
function clearSelection(){state.selected.clear();state.allMatching=false;renderSelection()}
function renderSelection(){const assignButton=$('alAssignSelected');if(assignButton)assignButton.disabled=!(state.allMatching||state.selected.size);const exportButton=$('alExportSelected');if(exportButton)exportButton.disabled=!(state.allMatching||state.selected.size);const checked=state.rows.length>0&&state.rows.every(r=>state.selected.has(r.id));$('alSelectPage').checked=checked;$('alSelectPage').indeterminate=!checked&&state.rows.some(r=>state.selected.has(r.id));const n=state.allMatching?state.total:state.selected.size;$('alSelectionText').textContent=`${fmtNum(n)} selected`;$('alSelectAllMatching').hidden=!state.totalKnown||!(state.total>state.rows.length&&!state.allMatching&&checked);$('alSelectAllMatching').textContent=`Select all ${fmtNum(state.total)} matching leads`}
function renderSummary(){const activeCount=state.filter==='active'?state.total:'—';$('adminLeadSummary').innerHTML=[['users',state.totalAll??'—','Total leads'],['filter',state.totalKnown?state.total:'—','Matching filters'],['file-text',state.rows.length,'On this page'],['user-check',state.rows.filter(x=>x.assigned_user_id).length,'Assigned on page'],['archive',state.rows.filter(isArchived).length,'Archived on page']].map(([symbol,n,label])=>`<div><i data-lucide="${symbol}"></i><section><strong>${typeof n==='number'?fmtNum(n):n}</strong><span>${label}</span></section></div>`).join('');icon()}
function renderPills(){const stageSelect=$('alStage');if(stageSelect){stageSelect.innerHTML=stageOptions(state.stage);stageSelect.value=state.stage;}const assignedLabel=$('alAssignedLabel');if(assignedLabel)assignedLabel.textContent=`Assigned: ${state.assignee==='unassigned'?'None':state.assignee?label(state.assignee):'All'}`;let p=[];if(state.tags.length)p.push(`Tags: ${state.tags.join(', ')} (${state.tagMode})`);if(state.sources.length)p.push(`Sources: ${state.sources.join(', ')} (${state.sourceMode})`);for(const [k,v] of [['Area code',state.areaCode],['Time zone',state.timezone],['State',state.stateCode],['Stage',state.stage],['Preview',state.preview]])if(v)p.push(`${k}: ${k==='Stage'?stageLabel(v):v}`);$('alActiveFilters').innerHTML=p.map(s=>`<span class="al-pill">${esc(s)}</span>`).join('')}
function renderRows(){const el=$('adminLeadList');if(!state.rows.length){el.innerHTML='<tr><td colspan="10" class="al-empty">No matching leads.</td></tr>';renderSelection();return}
 el.innerHTML=state.rows.map(r=>`<tr><td><input class="al-rowcheck" type="checkbox" data-check="${esc(r.id)}" aria-label="Select ${esc(r.company||r.name||'lead')}" ${state.selected.has(r.id)||state.allMatching?'checked':''}></td><td><button class="al-company-btn" data-open="${esc(r.id)}"><span class="al-company">${esc(r.company||r.name||'Unnamed lead')}</span><span class="al-sub">${esc(r.website||r.domain||'')}</span></button></td><td>${esc(r.name||'—')}</td><td>${esc(r.phone||'—')}<span class="al-sub">${esc(r.email||'')}</span></td><td>${esc(r.state_code||'—')}<span class="al-sub">${esc(r.timezone||'Time zone unknown')}</span></td><td>${normalizeList(r.tags).slice(0,4).map(x=>`<span class="al-chip">${esc(x)}</span>`).join('')||'—'}</td><td>${normalizeList(r.sources).slice(0,4).map(x=>`<span class="al-chip">${esc(x)}</span>`).join('')||'—'}</td><td><span class="al-chip stage">${esc(stageLabel(r.stage))}</span></td><td>${esc(label(r.assigned_user_id))}</td><td><button class="al-row-actions" data-open="${esc(r.id)}" aria-label="Open lead">⋯</button></td></tr>`).join('');
 el.querySelectorAll('[data-check]').forEach(x=>x.addEventListener('change',e=>{if(state.allMatching){state.selected=new Set(state.rows.map(row=>row.id));state.allMatching=false}if(e.target.checked)state.selected.add(x.dataset.check);else state.selected.delete(x.dataset.check);renderSelection()}));el.querySelectorAll('[data-open]').forEach(x=>x.addEventListener('click',()=>openLead(x.dataset.open)));renderSelection();}
function renderPage(){
 const buttons=[];
 const add=(v,t=v,disabled=false)=>buttons.push(`<button type="button" data-page="${v}" ${disabled?'disabled':''} class="${v===state.page?'current':''}">${t}</button>`);
 add(state.page-1,'‹',state.page===1);
 if(state.totalKnown){
  const pages=Math.max(1,Math.ceil(state.total/state.size));
  const shown=new Set([1,pages,state.page,state.page-1,state.page+1].filter(v=>v>0&&v<=pages));let prev=0;
  for(const n of [...shown].sort((a,b)=>a-b)){if(n>prev+1)buttons.push('<span>…</span>');add(n);prev=n}
  add(state.page+1,'›',state.page>=pages);
 }else{add(state.page);add(state.page+1,'›',!state.hasMore);}
 $('alPageButtons').innerHTML=buttons.join('');
 $('alPageButtons').querySelectorAll('[data-page]').forEach(x=>x.addEventListener('click',()=>{state.page=Number(x.dataset.page);clearSelection();loadRows(true)}));
 const first=(state.page-1)*state.size+1,last=first+state.rows.length-1;
 $('alPageStatus').textContent=state.rows.length?`Showing ${fmtNum(first)}–${fmtNum(last)}${state.totalKnown?' of '+fmtNum(state.total)+' matching leads':state.countPending?' · Counting matches…':' · Total unavailable'}`:'No matching leads';
}
async function loadMatchingCount(seq){
 try{
  const result=await query(client().from('crm').select('id',{count:'exact',head:true}),{noSort:true}).abortSignal(countController.signal);
  if(seq!==state.seq)return;
  if(result.error)throw result.error;
  if(!Number.isFinite(result.count))throw Error('No match count returned.');
  state.total=result.count;state.totalKnown=true;state.countPending=false;
  const last=Math.max(1,Math.ceil(state.total/state.size));
  if(state.page>last){state.page=last;return loadRows();}
  renderSummary();renderPage();renderSelection();
 }catch(error){
  if(seq!==state.seq)return;
  state.countPending=false;renderPage();renderSelection();console.warn('Lead count unavailable; loaded rows are retained:',error);
 }
}
async function loadPageRows(signal){
 const start=(state.page-1)*state.size,end=state.page*state.size,rows=[];
 // Stay below PostgREST response caps, including the 1,000/custom page sizes.
 for(let offset=start;offset<=end;offset+=500){
  if(signal.aborted)throw Error('Lead search cancelled.');
  const last=Math.min(offset+499,end);
  const result=await query().range(offset,last).abortSignal(signal);
  if(result.error)throw result.error;
  const batch=result.data||[];rows.push(...batch);
  if(batch.length<last-offset+1)break;
 }
 return {data:rows};
}
// Search in bounded primary-key batches. Each request remains small; the complete
// scan has no deadline and a database timeout retries the same cursor, never skips it.
function renderSearchProgress(scan){
 const panel=$('alSearchProgress');if(!panel)return;
 panel.hidden=false;
 if(scan.indexed){$('alSearchProgressText').textContent=`${fmtNum(scan.matches.length)} matches found · Complete`;$('alSearchProgressBar').value=100;return;}
 const denominator=scan.done?scan.scanned:scan.total;
 $('alSearchProgressText').textContent=`${fmtNum(scan.scanned)} of ${denominator===null?'…':fmtNum(Math.max(scan.scanned,denominator))} leads searched · ${fmtNum(scan.matches.length)} matches${scan.done?' · Complete':scan.retrying?' · Retrying smaller batch…':''}`;
 const bar=$('alSearchProgressBar');
 if(scan.done)bar.value=100;
 else if(denominator>0)bar.value=Math.min(99,scan.scanned/denominator*100);
 else bar.removeAttribute('value');
}
function searchKey(){return JSON.stringify([searchTerm(),state.areaCode,state.filter,state.assignee,state.timezone,state.stateCode,state.stage,state.preview,state.tags,state.sources,state.tagMode,state.sourceMode])}
function showSearchPage(matches,complete){
 const [key,dir]=state.sort.split('_'),sign=dir==='asc'?1:-1;
 // Keep NULLS LAST and a deterministic id tie-breaker.
 const sorted=[...matches].sort((a,b)=>{
  const x=a[key],y=b[key];
  if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;
  const order=x==null?0:x<y?-1:x>y?1:0;
  return order*sign||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0);
 });
 state.total=matches.length;state.totalKnown=complete;state.countPending=false;
 const start=(state.page-1)*state.size;
 state.rows=sorted.slice(start,start+state.size);state.hasMore=complete&&sorted.length>start+state.size;
 renderSummary();renderRows();renderPage();
 if(!complete){$('alPageStatus').textContent='Searching all leads… Results update as matches are found.';$('alPageButtons').innerHTML='';}
}
function waitForSearchRetry(signal,ms){return new Promise(resolve=>{
 const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve()};
 const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});
 if(signal.aborted)finish();
})}
async function scanSearch(seq,signal){
 const key=searchKey(),term=searchTerm();
 if(searchCache?.key===key){showSearchPage(searchCache.scan.matches,true);renderSearchProgress(searchCache.scan);return;}
 const scan={scanned:0,total:null,matches:[],done:false,retrying:false};
 let cursor=null,batchSize=250,retries=0;
 renderSearchProgress(scan);
 // This optional denominator never blocks results or invents an estimated total.
 void (async()=>{
  try{
   const result=await query(client().from('crm').select('id',{head:true,count:'exact'}),{skipSearch:true,noSort:true}).abortSignal(countController.signal);
   if(signal.aborted||seq!==state.seq||scan.done||result.error||!Number.isFinite(result.count))return;
   scan.total=result.count;renderSearchProgress(scan);
  }catch(error){console.warn('Search total unavailable:',error)}
 })();
 while(!signal.aborted&&seq===state.seq){
  let q=query(undefined,{skipSearch:true,noSort:true}).order('id',{ascending:true});
  if(cursor!==null)q=q.gt('id',cursor);
  const result=await q.limit(batchSize).abortSignal(signal);
  if(signal.aborted||seq!==state.seq)return;
  if(result.error){
   if(result.error.code==='57014'||/timeout|timed out/i.test(result.error.message||'')){
    batchSize=Math.max(1,Math.floor(batchSize/2));scan.retrying=true;renderSearchProgress(scan);
    await waitForSearchRetry(signal,Math.min(5000,250*2**Math.min(retries++,5)));continue;
   }
   throw result.error;
  }
  const batch=result.data||[];
  scan.retrying=false;retries=0;
  if(batch.length&&cursor!==null&&(typeof cursor==='number'?batch.at(-1).id<=cursor:String(batch.at(-1).id)<=String(cursor)))throw Error('Search cursor did not advance. Retry the search.');
  for(const row of batch)if(matchesSearch(row,term))scan.matches.push(row);
  scan.scanned+=batch.length;
  scan.done=batch.length<batchSize;
  showSearchPage(scan.matches,scan.done);renderSearchProgress(scan);
  if(scan.done){searchCache={key,scan};return;}
  cursor=batch.at(-1).id;
 }
}
// Race a small, unsorted indexed lookup against the resumable scan. Exact count
// must prove the entire result fits before this path may replace the scan/cache.
async function searchRows(seq,signal){
 // Area-code matching requires normalized phone digits, so use the complete scan.
 if(state.areaCode||searchCache?.key===searchKey())return scanSearch(seq,signal);
 const key=searchKey(),fast=new AbortController(),scan=new AbortController();
 const cancel=()=>{fast.abort();scan.abort()};
 signal.addEventListener('abort',cancel,{once:true});
 if(signal.aborted)cancel();
 const lookup=(async()=>{
  try{
   const result=await query(client().from('crm').select(fields,{count:'exact'}),{noSort:true}).range(0,499).abortSignal(fast.signal);
   if(signal.aborted||fast.signal.aborted||seq!==state.seq||result.error||!Array.isArray(result.data)||!Number.isFinite(result.count)||result.count!==result.data.length)return;
   // No ORDER BY means the database can use its search indexes without a
   // newest-first LIMIT plan. Sort the small complete result only in the browser.
   scan.abort();countController.abort();
   const complete={matches:result.data.filter(row=>matchesSearch(row,searchTerm())),done:true,indexed:true};
   searchCache={key,scan:complete};showSearchPage(complete.matches,true);renderSearchProgress(complete);
  }catch(error){console.warn('Indexed lookup unavailable; continuing progress search:',error)}
 })();
 try{await scanSearch(seq,scan.signal);}
 catch(error){if(!scan.signal.aborted)throw error;}
 finally{fast.abort();scan.abort();signal.removeEventListener('abort',cancel);}
 void lookup;
}
async function loadIndexedAreaRows(seq,signal){
 const base=client().rpc('admin_crm_by_area_code',{p_area_code:state.areaCode}).select(fields,{count:'exact'});
 const start=(state.page-1)*state.size,rows=[];
 let count=null;
 for(let offset=start;offset<start+state.size;offset+=500){
  const last=Math.min(offset+499,start+state.size-1);
  const result=await query(base,{noSort:false}).range(offset,last).abortSignal(signal);
  if(result.error)throw result.error;
  if(seq!==state.seq||signal.aborted)return;
  if(count===null)count=result.count;
  rows.push(...(result.data||[]));
  if((result.data||[]).length<last-offset+1)break;
 }
 state.rows=rows;state.total=Number.isFinite(count)?count:rows.length;
 state.totalKnown=Number.isFinite(count);state.countPending=false;state.hasMore=state.totalKnown?start+rows.length<state.total:rows.length===state.size;
 $('alSearchProgress').hidden=true;
 renderSummary();renderRows();renderPage();renderPills();
}
async function loadRows(reuseSearch=false){
 if(reuseSearch!==true)searchCache=null;
 const seq=++state.seq;
 rowsController?.abort();countController?.abort();rowsController=new AbortController();countController=new AbortController();
 state.totalKnown=false;state.countPending=true;state.hasMore=false;state.rows=[];state.allMatching=false;renderSelection();renderPills();
 const el=$('adminLeadList');el.innerHTML='<tr><td colspan="10" class="al-empty">Loading leads…</td></tr>';
 $('alPageStatus').textContent='Loading leads…';$('alPageButtons').innerHTML='';
 try{
  if(state.areaCode&&!/^[2-9]\d{2}$/.test(state.areaCode)){
   state.total=0;state.countPending=false;$('alSearchProgress').hidden=true;
   el.innerHTML='<tr><td colspan="10" class="al-empty">Enter a 3-digit area code (e.g. 970), or clear the area code field.</td></tr>';
   $('alPageStatus').textContent='Enter a valid area code to search.';renderSummary();return;
  }
  if(state.areaCode){await loadIndexedAreaRows(seq,rowsController.signal);return;}
  if(searchTerm()){await searchRows(seq,rowsController.signal);return;}
  $('alSearchProgress').hidden=true;
  // One extra row gives reliable Next-page navigation without waiting for COUNT(*).
  const result=await loadPageRows(rowsController.signal);
  if(seq!==state.seq)return;
  if(result.error)throw result.error;
  const rows=result.data||[];state.hasMore=rows.length>state.size;state.rows=rows.slice(0,state.size);
  renderSummary();renderRows();renderPage();renderPills();
  void loadMatchingCount(seq);
 }catch(error){
  if(seq!==state.seq)return;
  state.countPending=false;
  const timedOut=error?.code==='57014'||/statement timeout/i.test(error?.message||'');
  $('alSearchProgress').hidden=true;
  el.innerHTML=`<tr><td colspan="10" class="al-empty">${timedOut?'Search took too long. Try a more specific name or phone number.':`Could not load leads: ${esc(errorMessage(error))}`} <button type="button" id="alRetryLoad">Retry</button></td></tr>`;
  $('alRetryLoad').onclick=loadRows;$('alPageStatus').textContent='Could not load this page.';console.error(error);
 }
}
function refresh(){searchCache=null;state.page=1;clearSelection();loadRows()}
const pause=(f,ms)=>{let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>f(...args),ms)}};
function closeModal(){$('alModalWrap').hidden=true}
function modal(title,hint,body,footer){$('alModalTitle').textContent=title;$('alModalHint').textContent=hint;$('alModalBody').innerHTML=body;$('alModalFooter').innerHTML=footer;$('alModalWrap').hidden=false;$('alModalClose').onclick=closeModal;$('alModalWrap').onclick=e=>{if(e.target===$('alModalWrap'))closeModal()};icon()}
function footer(apply){return `<button type="button" id="alClearModal">Clear</button><button type="button" id="alApplyModal" class="al-apply">${apply}</button>`}
async function getFacets(){try{const r=await client().rpc('admin_lead_filter_facets');if(r.error)throw r.error;const rows=r.data||[];state.availableTags=rows.filter(x=>x.kind==='tag');state.availableSources=rows.filter(x=>x.kind==='source');}catch(e){console.warn('Run sql/admin-leads-filter-facets.sql for complete tag/source lists',e);const tags=new Map(),sources=new Map();for(const row of state.rows){for(const val of normalizeList(row.tags))tags.set(val,(tags.get(val)||0)+1);for(const val of normalizeList(row.sources))sources.set(val,(sources.get(val)||0)+1)}state.availableTags=[...tags].map(([value,count])=>({value,count}));state.availableSources=[...sources].map(([value,count])=>({value,count}));}}
async function openFacet(kind){await getFacets();const tags=kind==='tags',values=tags?state.availableTags:state.availableSources,selected=new Set(tags?state.tags:state.sources);let mode=tags?state.tagMode:state.sourceMode;const label=tags?'Tags':'Sources';modal(label,`View and filter all available ${label.toLowerCase()} from your CRM.`, `<input class="al-modal-search" id="alFacetSearch" type="search" placeholder="Search ${label.toLowerCase()}…"><div class="al-choice-head"><label><input type="checkbox" id="alFacetAll"> Select all visible</label><span>Match:</span><div class="al-mode"><button data-mode="AND">AND</button><button data-mode="OR">OR</button></div></div><div id="alFacetOptions" class="al-choice-grid"></div><p class="al-status-note">Counts are across the CRM and can include archived leads.</p>`,footer(`Apply ${label}`));
const render=()=>{const search=$('alFacetSearch').value.toLowerCase();const matches=values.filter(x=>String(x.value).toLowerCase().includes(search));$('alFacetOptions').innerHTML=matches.map(x=>`<label class="al-option"><input type="checkbox" data-val="${esc(x.value)}" ${selected.has(x.value)?'checked':''}><span class="al-option-name" title="${esc(x.value)}">${esc(x.value)}</span><span class="al-count">${fmtNum(x.count)}</span></label>`).join('')||'<p>No options found.</p>';$('alFacetOptions').querySelectorAll('[data-val]').forEach(x=>x.onchange=()=>x.checked?selected.add(x.dataset.val):selected.delete(x.dataset.val));$('alFacetAll').checked=matches.length>0&&matches.every(x=>selected.has(x.value));$('alModalBody').querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));};$('alFacetSearch').oninput=render;$('alFacetAll').onchange=e=>{for(const x of values.filter(v=>String(v.value).toLowerCase().includes($('alFacetSearch').value.toLowerCase())))e.target.checked?selected.add(x.value):selected.delete(x.value);render()};$('alModalBody').querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;render()});$('alClearModal').onclick=()=>{selected.clear();render()};$('alApplyModal').onclick=()=>{if(tags){state.tags=[...selected];state.tagMode=mode}else{state.sources=[...selected];state.sourceMode=mode}closeModal();refresh()};render()}
function openAdvanced(){const opts=(items,selected)=>items.map(([v,t])=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(t)}</option>`).join('');modal('Advanced Filters','Combine these filters with search, tags and sources.',`<div class="al-advanced-grid"><label>Assigned to<select id="advAssignee">${opts([['','All salespeople'],['unassigned','Unassigned'],...state.users.map(u=>[u.user_id,u.display_name||u.email])],state.assignee)}</select></label><label>Time zone<input class="al-modal-field" id="advTimezone" type="text" placeholder="e.g. America/Los_Angeles" value="${esc(state.timezone)}"></label><label>State code<input class="al-modal-field" id="advState" placeholder="e.g. NV" value="${esc(state.stateCode)}"></label><label>Stage<select id="advStage">${stageOptions(state.stage)}</select></label><label>Site preview<select id="advPreview">${opts([['','All'],['yes','Has preview'],['no','No preview']],state.preview)}</select></label></div>`,footer('Apply Filters'));$('alClearModal').onclick=()=>{state.assignee='';state.timezone='';state.stateCode='';state.stage='';state.preview='';closeModal();refresh()};$('alApplyModal').onclick=()=>{state.assignee=$('advAssignee').value;state.timezone=$('advTimezone').value.trim();state.stateCode=$('advState').value.trim();state.stage=$('advStage').value;state.preview=$('advPreview').value;closeModal();refresh()}}
function options(selected=''){return `<option value="">Unassigned</option>`+state.users.map(x=>`<option value="${esc(x.user_id)}" ${selected===x.user_id?'selected':''}>${esc(x.display_name||x.email)}</option>`).join('')}
function openLead(id){const r=state.rows.find(x=>x.id===id);if(!r)return;const overlay=$('adminLeadDrawerOverlay'),drawer=$('adminLeadDrawer');drawer.innerHTML=`<div class="admin-user-drawer-head"><div><span class="admin-kicker">LEAD</span><h2>${esc(r.company||r.name||'Lead')}</h2><p>Created ${esc(fmtDate(r.created))}</p></div><button type="button" id="alCloseDrawer"><i data-lucide="x"></i></button></div><div class="admin-lead-form-grid"><label>Company<input id="leadCompany" value="${esc(r.company)}"></label><label>Contact<input id="leadName" value="${esc(r.name)}"></label><label>Phone<input id="leadPhone" value="${esc(r.phone)}"></label><label>Email<input id="leadEmail" value="${esc(r.email)}"></label><label>Stage<select id="leadStage">${['notstarted','staging','outreach','review','complete','notinterested','archived','callback'].map(x=>`<option ${x===r.stage?'selected':''}>${x}</option>`).join('')}</select></label><label>Outcome<input id="leadOutcome" value="${esc(r.outcome)}"></label><label class="full">Assigned to<select id="leadAssigned">${options(r.assigned_user_id)}</select></label><label class="full">Notes<textarea id="leadNotes">${esc(r.notes)}</textarea></label></div><div class="admin-lead-actions"><button class="primary" id="adminSharePreview"><i data-lucide="link"></i>Create Preview Signup Link</button><button class="primary" id="alSave"><i data-lucide="save"></i>Save Changes</button><button id="alArchive">${isArchived(r)?'Restore':'Archive'} Lead</button><button class="danger" id="alDelete">Delete Permanently</button></div><p id="alDrawerMessage"></p>`;overlay.hidden=false;const close=()=>overlay.hidden=true;drawer.querySelector('#alCloseDrawer').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};const msg=()=>drawer.querySelector('#alDrawerMessage');drawer.querySelector('#alSave').onclick=async()=>{const assignee=drawer.querySelector('#leadAssigned').value;const payload={company:drawer.querySelector('#leadCompany').value.trim(),name:drawer.querySelector('#leadName').value.trim(),phone:drawer.querySelector('#leadPhone').value.trim(),email:drawer.querySelector('#leadEmail').value.trim(),stage:drawer.querySelector('#leadStage').value,outcome:drawer.querySelector('#leadOutcome').value.trim(),notes:drawer.querySelector('#leadNotes').value.trim(),assigned_user_id:assignee||null,assigned:assignee?label(assignee):''};msg().textContent='Saving…';const {error}=await client().from('crm').update(payload).eq('id',r.id);if(error){msg().textContent=error.message;return}close();loadRows()};drawer.querySelector('#alArchive').onclick=async()=>{if(!confirm(`${isArchived(r)?'Restore':'Archive'} this lead?`))return;const next=!isArchived(r);const {error}=await client().from('crm').update({admin_archived:next,admin_archived_at:next?new Date().toISOString():null}).eq('id',r.id);if(error){msg().textContent=error.message;return}close();loadRows()};drawer.querySelector('#alDelete').onclick=async()=>{if(!confirm('Permanently delete this lead? This cannot be undone.'))return;const {error}=await client().from('crm').delete().eq('id',r.id);if(error){msg().textContent=error.message;return}close();loadRows()};drawer.querySelector('#adminSharePreview').onclick=async()=>{if(!r.sitekey||!/^https:\/\//.test(r.previewurl||'')){msg().textContent='A site key and HTTPS preview URL are required.';return}const {data,error}=await client().rpc('create_portal_preview_invite',{p_site_key:r.sitekey,p_site_title:r.company||r.name||'Website Preview',p_preview_url:r.previewurl});if(error){msg().textContent=error.message;return}try{await navigator.clipboard.writeText(data);msg().textContent='Link copied.'}catch{msg().textContent=data}};icon()}
function openNewLead(){const overlay=$('adminLeadDrawerOverlay'),drawer=$('adminLeadDrawer');drawer.innerHTML=`<div class="admin-user-drawer-head"><h2>Add Lead</h2><button id="alCloseDrawer" type="button">×</button></div><div class="admin-lead-form-grid"><label>Company<input id="leadCompany"></label><label>Contact<input id="leadName"></label><label>Phone<input id="leadPhone"></label><label>Email<input id="leadEmail"></label><label class="full">Assigned to<select id="leadAssigned">${options()}</select></label><label class="full">Notes<textarea id="leadNotes"></textarea></label></div><div class="admin-lead-actions"><button class="primary" id="alCreate">Create Lead</button></div><p id="alDrawerMessage"></p>`;overlay.hidden=false;drawer.querySelector('#alCloseDrawer').onclick=()=>overlay.hidden=true;overlay.onclick=e=>{if(e.target===overlay)overlay.hidden=true};drawer.querySelector('#alCreate').onclick=async()=>{const payload={company:drawer.querySelector('#leadCompany').value.trim(),name:drawer.querySelector('#leadName').value.trim(),phone:drawer.querySelector('#leadPhone').value.trim(),email:drawer.querySelector('#leadEmail').value.trim(),notes:drawer.querySelector('#leadNotes').value.trim(),assigned_user_id:drawer.querySelector('#leadAssigned').value||null,stage:'notstarted',admin_archived:false};payload.assigned=payload.assigned_user_id?label(payload.assigned_user_id):'';if(!payload.company&&!payload.name){drawer.querySelector('#alDrawerMessage').textContent='Enter a company or contact.';return}const {error}=await client().from('crm').insert(payload);if(error){drawer.querySelector('#alDrawerMessage').textContent=error.message;return}overlay.hidden=true;refresh()}}
async function targetIds(){if(state.allMatching&&searchCache?.key===searchKey())return searchCache.scan.matches.map(row=>row.id);if(!state.allMatching)return [...state.selected];if(state.areaCode)throw Error('Wait for the area code search to complete, then select matching leads again.');const ids=[];const batch=500;let index=0;while(true){const r=await query(client().from('crm').select('id'),{noSort:true}).order('id',{ascending:true}).range(index,index+batch-1);if(r.error)throw r.error;ids.push(...(r.data||[]).map(x=>x.id));if(!r.data||r.data.length<batch)break;index+=batch;if(index>250000)throw Error('The selection is too large for browser-side processing. Narrow the filters.')}return ids}
async function activeSalespeople(){
 const [perms,profiles]=await Promise.all([
  client().from('team_permissions').select('user_id,role,active,listed').in('role',['SALES','ADMIN']).eq('active',true),
  client().from('callcenter_profiles').select('user_id,display_name,email,disabled_at').is('disabled_at',null)
 ]);
 if(perms.error)throw perms.error;
 if(profiles.error)throw profiles.error;
 const ids=new Set((perms.data||[]).filter(x=>x.listed!==false && (x.role==='SALES'||(x.role==='ADMIN'&&String((profiles.data||[]).find(p=>p.user_id===x.user_id)?.email||'').toLowerCase()==='kiara@steadyhandsop.com'))).map(x=>x.user_id));
 return (profiles.data||[]).filter(x=>ids.has(x.user_id)).sort((a,b)=>(a.display_name||a.email||'').localeCompare(b.display_name||b.email||''));
}
async function openAssignedFilter(){
 modal('Assigned Leads','Show unassigned leads, all assignments, or leads assigned to an active salesperson.','<p class="al-status-note">Loading active salespeople…</p>','<button type="button" id="alCancelAssigned">Close</button>');
 $('alCancelAssigned').onclick=closeModal;
 try{
  const people=await activeSalespeople();
  if($('alModalTitle').textContent!=='Assigned Leads'||$('alModalWrap').hidden)return;
  const choices=[{user_id:'unassigned',display_name:'None',email:'Unassigned leads'},{user_id:'',display_name:'All salespeople',email:'All leads, assigned or unassigned'},...people];
  $('alModalBody').innerHTML='<input id="alFilterAssigneeSearch" type="search" class="al-modal-search" placeholder="Search active salespeople…"><div id="alFilterAssigneeOptions" class="al-assignee-options"></div>';
  const render=()=>{
   const term=$('alFilterAssigneeSearch').value.trim().toLowerCase();
   const found=choices.filter(p=>(p.display_name||'').toLowerCase().includes(term)||(p.email||'').toLowerCase().includes(term));
   $('alFilterAssigneeOptions').innerHTML=found.map(p=>`<button type="button" class="al-assignee-option ${state.assignee===p.user_id?'selected':''}" data-filter-person="${esc(p.user_id)}"><span class="al-assignee-avatar">${esc((p.display_name||'?').charAt(0).toUpperCase())}</span><span><strong>${esc(p.display_name)}</strong><small>${esc(p.email||'')}</small></span>${state.assignee===p.user_id?'<span class="al-active-marker">Selected</span>':''}</button>`).join('')||'<p class="al-status-note">No matching salespeople.</p>';
   $('alFilterAssigneeOptions').querySelectorAll('[data-filter-person]').forEach(b=>b.onclick=()=>{state.assignee=b.dataset.filterPerson;closeModal();refresh()});
  };
  $('alFilterAssigneeSearch').oninput=render;render();
 }catch(e){$('alModalBody').innerHTML=`<p class="al-status-note">Could not load active salespeople: ${esc(e.message)}</p>`;}
}
async function openAssignment(){
 if(!state.allMatching&&!state.selected.size){alert('Select at least one lead first.');return}
 const count=state.allMatching?state.total:state.selected.size;
 modal('Assign Selected Leads',`Choose an active salesperson or Unassigned for ${fmtNum(count)} selected lead(s).`,'<p class="al-status-note">Loading active salespeople…</p>','<button type="button" id="alCancelAssign">Cancel</button>');
 $('alCancelAssign').onclick=closeModal;
 try{
  const people=await activeSalespeople();
  if($('alModalTitle').textContent!=='Assign Selected Leads'||$('alModalWrap').hidden)return;
  const choices=[{user_id:'',display_name:'Unassigned',email:'Remove current assignment'},...people];
  $('alModalBody').innerHTML=`<input type="search" id="alAssignSearch" class="al-modal-search" placeholder="Search assignment options…"><p class="al-status-note">Choose Unassigned to remove the current owner, or choose an active salesperson to replace the assignment.</p><div id="alAssignOptions" class="al-assignee-options"></div><p id="alAssignStatus" class="al-status-note" role="status"></p>`;
  $('alModalFooter').innerHTML='<button type="button" id="alCancelAssign">Cancel</button><button type="button" id="alConfirmAssign" class="al-apply" disabled>Assign Leads</button>';
  $('alCancelAssign').onclick=closeModal;
  let chosen=null,saving=false;
  const render=()=>{const term=$('alAssignSearch').value.trim().toLowerCase();const visible=choices.filter(u=>(u.display_name||'').toLowerCase().includes(term)||(u.email||'').toLowerCase().includes(term));$('alAssignOptions').innerHTML=visible.map(u=>`<button type="button" class="al-assignee-option ${chosen===u.user_id?'selected':''}" data-person="${esc(u.user_id)}"><span class="al-assignee-avatar">${esc((u.display_name||u.email||'?').charAt(0).toUpperCase())}</span><span><strong>${esc(u.display_name||u.email||'Salesperson')}</strong><small>${esc(u.email||'')}</small></span>${u.user_id?'<span class="al-active-marker">Active</span>':''}</button>`).join('')||'<p>No assignment options match your search.</p>';$('alAssignOptions').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{if(saving)return;chosen=b.dataset.person;$('alConfirmAssign').disabled=false;$('alConfirmAssign').textContent=chosen===''?'Unassign Leads':'Assign Leads';render()})};
  $('alAssignSearch').oninput=render;render();
  $('alConfirmAssign').onclick=async()=>{
   if(chosen===null||saving)return;
   saving=true;
   const unassign=chosen==='';
   const button=$('alConfirmAssign');button.disabled=true;$('alCancelAssign').disabled=true;
   $('alAssignStatus').textContent=unassign?'Unassigning selected leads…':'Assigning selected leads…';
   try{
    // Recheck current account status just before making changes.
    const valid=unassign?null:(await activeSalespeople()).find(u=>u.user_id===chosen);
    if(!unassign&&!valid)throw Error('This salesperson is no longer active. No leads were assigned.');
    const ids=await targetIds();
    for(let i=0;i<ids.length;i+=250){
     const res=await client().from('crm').update({assigned_user_id:unassign?null:chosen,assigned:unassign?'':valid.display_name||valid.email||'Salesperson'}).in('id',ids.slice(i,i+250)).select('id');
     if(res.error)throw res.error;
     if((res.data||[]).length!==Math.min(250,ids.length-i))throw Error('Not every selected lead was updated. Check permissions and refresh.');
    }
    closeModal();clearSelection();await loadRows();alert(unassign?`Unassigned ${fmtNum(ids.length)} leads.`:`Assigned ${fmtNum(ids.length)} leads to ${valid.display_name||valid.email}.`);
   }catch(e){$('alAssignStatus').textContent=e.message;console.error('Lead assignment:',e);await loadRows()}finally{saving=false;button.disabled=false;$('alCancelAssign').disabled=false}
  };
 }catch(e){$('alModalBody').innerHTML=`<p class="al-status-note">Unable to load active salespeople: ${esc(e.message)}</p>`}
}
// Export the complete explicit or filtered selection, not just the rendered page.
const exportColumns=['id','company','name','phone','altphone','email','website','domain','notes','issue','concerns','origin','assigned','assigned_user_id','assigned_to','tags','sources','stage','outcome','callbackdate','callbackat','lastcalled','timezone','state_code','leadpotential','tier','previewurl','sitekey','has_site_preview','admin_archived','admin_archived_at','created'];
const exportValue=(row,key)=>key==='assigned_to'?label(row.assigned_user_id):row[key]??'';
const csvCell=value=>{
 const input=Array.isArray(value)?value.map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join('; '):typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');
 // Prevent spreadsheet formula execution when opening exported customer data.
 const safe=/^\s*[=+@-]/.test(input)?"'"+input:input;
 return '"'+safe.replace(/"/g,'""')+'"';
};
function downloadExport(content,type,extension){
 const blob=new Blob([content],{type});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='steadyhands-selected-leads-'+new Date().toISOString().slice(0,10)+'.'+extension;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportSelected(format){
 if(!state.allMatching&&!state.selected.size){alert('Select at least one lead first.');return}
 const button=$('alExportSelected');
 if(button)button.disabled=true;
 const oldText=button?.innerHTML;
 if(button)button.textContent='Exporting…';
 try{
  const ids=await targetIds();
  if(!ids.length)throw Error('No matching leads were found to export.');
  const rows=[];
  // Supabase/PostgREST limits result size per request; fetch in small, reliable chunks.
  for(let i=0;i<ids.length;i+=150){
   const chunk=ids.slice(i,i+150);
   const result=await client().from('crm').select(fields).in('id',chunk);
   if(result.error)throw result.error;
   rows.push(...(result.data||[]));
  }
  if(rows.length!==ids.length)throw Error('Some selected leads could not be retrieved. Nothing was exported.');
  const byId=new Map(rows.map(row=>[String(row.id),row]));
  const ordered=ids.map(id=>byId.get(String(id)));
  if(ordered.some(row=>!row))throw Error('Some selected leads are no longer available. Refresh and retry.');
  if(format==='json'){
   const output=ordered.map(row=>({...row,assigned_to:label(row.assigned_user_id)}));
   downloadExport(JSON.stringify(output,null,2),'application/json;charset=utf-8','json');
  }else{
   const csv='\uFEFF'+[exportColumns.join(','),...ordered.map(row=>exportColumns.map(key=>csvCell(exportValue(row,key))).join(','))].join('\r\n');
   downloadExport(csv,'text/csv;charset=utf-8','csv');
  }
 }catch(e){showError(e)}
 finally{if(button){button.innerHTML=oldText;button.disabled=!(state.allMatching||state.selected.size);icon()}}
}
function openExport(){
 if(!state.allMatching&&!state.selected.size){alert('Select at least one lead first.');return}
 const count=state.allMatching?state.total:state.selected.size;
 modal('Export Selected Leads',`Download all ${fmtNum(count)} selected lead(s), including selections across matching results.`,
 '<p class="al-status-note">Choose a file format. CSV opens in Excel or spreadsheets. JSON preserves structured data such as tags and sources.</p>',
 '<button type="button" id="alExportCancel">Cancel</button><button type="button" class="al-apply" id="alExportCsv">Download CSV</button><button type="button" class="al-apply" id="alExportJson">Download JSON</button>');
 $('alExportCancel').onclick=closeModal;
 for(const [id,format] of [['alExportCsv','csv'],['alExportJson','json']]){
  $(id).onclick=async()=>{closeModal();await exportSelected(format)};
 }
}
async function applyBulk(){const action=$('alBulkAction').value;$('alBulkAction').value='';if(!action)return;if(!state.allMatching&&!state.selected.size){alert('Select at least one lead first.');return}if(action==='export_csv'||action==='export_json'){await exportSelected(action==='export_csv'?'csv':'json');return}
if(action==='assign'){await openAssignment();return}
let userId='';
const count=state.allMatching?state.total:state.selected.size;if(!confirm(`Apply "${action}" to ${fmtNum(count)} leads?${action==='assign'?' Existing assignments will be replaced.':''}`))return;const btn=$('alBulkAction');btn.disabled=true;try{const ids=await targetIds();const changes=action==='assign'?{assigned_user_id:userId,assigned:label(userId)}:action==='unassign'?{assigned_user_id:null,assigned:''}:action==='archive'?{admin_archived:true,admin_archived_at:new Date().toISOString()}:{admin_archived:false,admin_archived_at:null};for(let i=0;i<ids.length;i+=250){const res=await client().from('crm').update(changes).in('id',ids.slice(i,i+250)).select('id');if(res.error)throw res.error;if((res.data||[]).length!==Math.min(250,ids.length-i))throw Error('Not every selected lead was updated. Check row-level security and refresh.')}clearSelection();await loadRows();alert(`Updated ${fmtNum(ids.length)} leads.`)}catch(e){showError(e);await loadRows()}finally{btn.disabled=false}}
async function loadTotalCount(){
 try{const total=await client().from('crm').select('id',{head:true,count:'exact'});if(total.error)throw total.error;state.totalAll=total.count;renderSummary();}
 catch(error){console.warn('Global lead count unavailable:',error);}
}
async function initialize(){
 if(state.loaded)return;state.loaded=true;const c=client();if(!c){state.loaded=false;return;}
 try{
  const users=await c.from('callcenter_profiles').select('user_id,display_name,email').order('display_name');
  if(users.error)throw users.error;state.users=users.data||[];
  await loadRows();void loadTotalCount();
 }catch(error){state.loaded=false;$('adminLeadList').innerHTML=`<tr><td colspan="10" class="al-empty">${esc(errorMessage(error))}</td></tr>`;}
}
$('alStage').onchange=e=>{state.stage=e.target.value;refresh()};
$('alAreaCode').addEventListener('input',pause(e=>{state.areaCode=e.target.value.trim();refresh()},300));
$('adminLeadSearch').addEventListener('input',pause(e=>{state.query=e.target.value;refresh()},300));$('adminAddLead').onclick=openNewLead;$('alAssignSelected').onclick=openAssignment;$('alExportSelected').onclick=openExport;$('alTags').onclick=()=>openFacet('tags');$('alSources').onclick=()=>openFacet('sources');$('alAdvanced').onclick=openAdvanced;$('alAssigned').onclick=openAssignedFilter;
$('alPageSize').onchange=e=>{const v=e.target.value;if(v==='custom'){const requested=prompt('Number of leads per page (1–5000):','250');const n=Number(requested);if(!Number.isInteger(n)||n<1||n>5000){e.target.value=String(state.size);return}state.size=n;const custom=document.createElement('option');custom.value=String(n);custom.textContent=`${n} per page`;e.target.append(custom);e.target.value=String(n)}else state.size=Number(v);refresh()};
$('alSort').onchange=e=>{state.sort=e.target.value;refresh()};$('alBulkAction').onchange=applyBulk;
$('alSelectPage').onchange=e=>{state.allMatching=false;for(const r of state.rows)e.target.checked?state.selected.add(r.id):state.selected.delete(r.id);renderRows()};$('alSelectAllMatching').onclick=()=>{if(!state.totalKnown)return;state.allMatching=true;renderSelection()};
document.querySelectorAll('[data-lead-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.leadFilter;document.querySelectorAll('[data-lead-filter]').forEach(x=>x.classList.toggle('active',x===b));refresh()});
if(window.steadyHandsAdminSession)initialize();else window.addEventListener('steadyhands:admin-ready',initialize,{once:true});
})();
