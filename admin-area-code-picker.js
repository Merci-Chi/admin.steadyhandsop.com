(() => {
 'use strict';
 const input=document.getElementById('alAreaCode');
 if(!input)return;
 const wrapper=input.closest('.al-area-code');
 const panel=document.createElement('div');
 panel.className='al-area-picker';panel.hidden=true;
 panel.innerHTML='<div class="al-area-picker-head"><strong>Uncalled area codes</strong><button type="button" data-area-close>Close</button></div><input class="al-area-picker-search" type="search" placeholder="Search area code or state…" aria-label="Search available area codes"><div class="al-area-picker-list" role="listbox"></div><div class="al-area-picker-empty" data-area-message>Loading area codes…</div>';
 wrapper.append(panel);
 const search=panel.querySelector('.al-area-picker-search'),list=panel.querySelector('.al-area-picker-list'),message=panel.querySelector('[data-area-message]');
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const stateZones={AL:'America/Chicago',AK:'America/Anchorage',AZ:'America/Phoenix',AR:'America/Chicago',CA:'America/Los_Angeles',CO:'America/Denver',CT:'America/New_York',DE:'America/New_York',FL:'America/New_York',GA:'America/New_York',HI:'Pacific/Honolulu',IA:'America/Chicago',ID:'America/Boise',IL:'America/Chicago',IN:'America/Indiana/Indianapolis',KS:'America/Chicago',KY:'America/New_York',LA:'America/Chicago',MA:'America/New_York',MD:'America/New_York',ME:'America/New_York',MI:'America/Detroit',MN:'America/Chicago',MO:'America/Chicago',MS:'America/Chicago',MT:'America/Denver',NC:'America/New_York',ND:'America/Chicago',NE:'America/Chicago',NH:'America/New_York',NJ:'America/New_York',NM:'America/Denver',NV:'America/Los_Angeles',NY:'America/New_York',OH:'America/New_York',OK:'America/Chicago',OR:'America/Los_Angeles',PA:'America/New_York',RI:'America/New_York',SC:'America/New_York',SD:'America/Chicago',TN:'America/Chicago',TX:'America/Chicago',UT:'America/Denver',VA:'America/New_York',VT:'America/New_York',WA:'America/Los_Angeles',WI:'America/Chicago',WV:'America/New_York',WY:'America/Denver',DC:'America/New_York',PR:'America/Puerto_Rico'};
 const nationwideCodes=new Set(['800','833','844','855','866','877','888','822','880','881','882','883','884','885','886','887','889']);
 const aliases={EST:'America/New_York',EDT:'America/New_York',ET:'America/New_York',CST:'America/Chicago',CDT:'America/Chicago',CT:'America/Chicago',MST:'America/Denver',MDT:'America/Denver',MT:'America/Denver',PST:'America/Los_Angeles',PDT:'America/Los_Angeles',PT:'America/Los_Angeles',HST:'Pacific/Honolulu',AKST:'America/Anchorage',AKDT:'America/Anchorage'};
 let areaZones={};
 const zoneCache=new Map();
 function zone(row){
  const mapped=areaZones[String(row.area_code)];
  const raw=String(row.timezone||'').trim(),candidate=mapped?.timezone||zoneCache.get(String(row.area_code))?.timezone||aliases[raw.toUpperCase()]||raw||stateZones[String(row.state_code||'').toUpperCase()];
  if(!candidate)return null;
  try{new Intl.DateTimeFormat('en-US',{timeZone:candidate});return candidate}catch{return stateZones[String(row.state_code||'').toUpperCase()]||null}
 }
 function local(zone,now){
  if(!zone)return {label:'No single time zone',open:false};
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'numeric',minute:'2-digit',hour12:false}).formatToParts(now);
  const get=t=>parts.find(p=>p.type===t)?.value;
  const hour=Number(get('hour'))%24,weekday=get('weekday'),minute=get('minute');
  const label=new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:true}).format(now);
  return {label,open:['Mon','Tue','Wed','Thu','Fri'].includes(weekday)&&hour>=9&&hour<17,weekday,minute};
 }
 let rows=[],loaded=false,loading=false;
 function render(){
  if(panel.hidden)return;
  const now=new Date(),term=search.value.trim().toLowerCase();
  const visible=rows.map(row=>({...row,displayState:nationwideCodes.has(String(row.area_code))?'Toll-free / nationwide':areaZones[String(row.area_code)]?.state||zoneCache.get(String(row.area_code))?.state||row.state_code,clock:local(nationwideCodes.has(String(row.area_code))?null:zone(row),now)}))
   .filter(row=>[row.area_code,row.displayState,row.timezone].some(v=>String(v||'').toLowerCase().includes(term)))
   .sort((a,b)=>Number(b.clock.open)-Number(a.clock.open)||Number(b.uncalled_count)-Number(a.uncalled_count)||a.area_code.localeCompare(b.area_code));
  list.innerHTML=visible.map((row,i)=>`
   ${i===0||visible[i-1].clock.open!==row.clock.open?'<div class="al-area-picker-divider">'+(row.clock.open?'Monday–Friday · 9 AM–5 PM':'Outside calling hours / unknown')+'</div>':''}
   <button type="button" class="al-area-picker-option" role="option" data-code="${escapeHtml(row.area_code)}">
    <span><strong>${escapeHtml(row.area_code)} · ${escapeHtml(row.displayState||'Region unavailable')}</strong><small>${Number(row.uncalled_count).toLocaleString()} uncalled leads</small></span>
    <span class="al-area-picker-clock"><strong class="${row.clock.open?'al-area-picker-open':''}">${escapeHtml(row.clock.label)}</strong><small>${row.clock.open?'Within calling hours':nationwideCodes.has(String(row.area_code))?'Use prospect location':'Outside calling hours'}</small></span>
   </button>`).join('');
  message.hidden=visible.length>0;
  if(!visible.length)message.textContent=loading?'Loading area codes…':loaded?'No uncalled area codes match.':'Area-code data unavailable. The database function may need to be installed.';
 }
 async function loadZones(){
  try {
   const response=await fetch('admin-area-code-zones.json?v=20261021',{cache:'force-cache'});
   if(!response.ok)throw Error('Area code mapping unavailable');
   areaZones=(await response.json()).codes||{};
  }catch(e){console.warn('Bundled area code lookup could not load:',e)}
 }
 async function resolveMissingZones(){
  // The bundled map covers known historic geographic NPAs. Query a regularly
  // maintained NANPA-based directory only for newer or missing area codes.
  const missing=rows.filter(r=>!nationwideCodes.has(String(r.area_code))&&!areaZones[String(r.area_code)]?.timezone&&!zone(r));
  let cursor=0;
  async function worker(){
   while(cursor<missing.length){
    const row=missing[cursor++],code=String(row.area_code);
    try{
     const response=await fetch('https://areacode.fyi/api/v1/area-code/'+encodeURIComponent(code));
     if(!response.ok)continue;
     const item=await response.json();
     const candidate=item.timezone;
     if(!candidate||typeof candidate!=='string')continue;
     new Intl.DateTimeFormat('en-US',{timeZone:candidate});
     zoneCache.set(code,{timezone:candidate,state:item.region||item.state||''});
     render();
    }catch(e){console.warn('Timezone lookup failed for area code',code,e)}
   }
  }
  await Promise.all(Array.from({length:Math.min(4,missing.length)},worker));
 }
 async function load(){
  if(loading||loaded)return;
  loading=true;render();
  try{
   const crm=window.steadyHandsCRMClient;
   if(!crm)throw Error('Not signed in');
   const result=await crm.rpc('admin_area_code_calling_summary');
   if(result.error)throw result.error;
   rows=(result.data||[]).filter(r=>Number(r.uncalled_count)>0);
   await loadZones();
   loaded=true;
   void resolveMissingZones();
  }catch(error){console.warn('Area-code summary:',error);message.textContent='Area-code list unavailable: '+(error.message||error)}
  finally{loading=false;render()}
 }
 function open(){panel.hidden=false;search.value='';render();void load()}
 input.addEventListener('focus',open);
 input.addEventListener('click',open);
 panel.querySelector('[data-area-close]').onclick=()=>panel.hidden=true;
 search.addEventListener('input',render);
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-code]');if(!button)return;
  input.value=button.dataset.code;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  panel.hidden=true;
 });
 document.addEventListener('pointerdown',event=>{if(!wrapper.contains(event.target))panel.hidden=true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')panel.hidden=true});
 setInterval(()=>{if(!panel.hidden)render()},60000);
 // Refresh server counts when reopened after five minutes.
 let lastRefresh=0;
 input.addEventListener('focus',()=>{if(Date.now()-lastRefresh>300000){loaded=false;lastRefresh=Date.now();void load()}});
})();
