(() => {
'use strict';
const ZONE='America/Los_Angeles', TABLE='sh_consultation_bookings';
const $=q=>document.querySelector(q);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const today=new Date(), view={year:today.getFullYear(),month:today.getMonth(),selected:'',status:'all',search:''};
let entries=[],busy=false,opened=null,loaded=false,initialized=false,seenBookingIds=null,checkingNotices=false;
const fmtParts=(value,zone=ZONE)=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
};
const dateKey=value=>{const p=fmtParts(value);return `${p.year}-${pad(p.month)}-${pad(p.day)}`};
const formatTime=value=>new Intl.DateTimeFormat('en-US',{timeZone:ZONE,weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const timeOnly=value=>new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(value));
const monthName=()=>new Date(view.year,view.month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
const monthKey=()=>`${view.year}-${pad(view.month+1)}`;
const activeRows=()=>entries.filter(r=>view.status==='all'||r.status===view.status).filter(r=>{
 if(!view.search)return true;
 const q=view.search;return [r.business_name,r.customer_name,r.customer_email,r.customer_phone,JSON.stringify(r.services||[])].some(s=>String(s??'').toLowerCase().includes(q));
});
function setMessage(message=''){$('#bkMessage').textContent=message;}
function updateStats(){
 const now=Date.now(),valid=entries.filter(r=>!['cancelled','declined'].includes(r.status));
 const stats=[valid.filter(r=>Date.parse(r.start_at)>=now).length,entries.filter(r=>r.status==='submitted').length,entries.filter(r=>r.status==='confirmed').length];
 $('#bkStats').innerHTML=['Upcoming this month','Submitted this month','Confirmed this month'].map((label,i)=>`<div class="bk-stat"><small>${label}</small><strong>${stats[i]}</strong></div>`).join('');
}
function renderCalendar(){
 $('#bkMonthTitle').textContent=monthName();
 const start=new Date(view.year,view.month,1),length=new Date(view.year,view.month+1,0).getDate(),offset=start.getDay();
 const counts=new Map(),pending=new Map();
 activeRows().forEach(r=>{const k=dateKey(r.start_at);counts.set(k,(counts.get(k)||0)+1);if(r.status==='submitted')pending.set(k,(pending.get(k)||0)+1)});
 const localToday=dateKey(new Date()),cells=[];
 for(let i=0;i<offset;i++)cells.push('<span class="bk-day" aria-hidden="true"></span>');
 for(let day=1;day<=length;day++){
  const k=`${monthKey()}-${pad(day)}`,n=counts.get(k)||0;
  cells.push(`<button type="button" class="bk-day ${view.selected===k?'is-selected':''} ${localToday===k?'is-today':''}" data-bk-day="${k}" aria-pressed="${view.selected===k}"><span class="bk-day-num">${day}</span>${n?`<span class="bk-day-count">${n} booking${n===1?'':'s'}</span>`:''}${pending.get(k)?`<span class="bk-day-pending">${pending.get(k)} new</span>`:''}</button>`);
 }
 const remainder=(7-(offset+length)%7)%7;for(let i=0;i<remainder;i++)cells.push('<span class="bk-day" aria-hidden="true"></span>');
 $('#bkCalendar').innerHTML=cells.join('');
 $('#bkCalendar').querySelectorAll('[data-bk-day]').forEach(b=>b.addEventListener('click',()=>{view.selected=b.dataset.bkDay===view.selected?'':b.dataset.bkDay;render();}));
}
function bookingCard(r){
 const details=(Array.isArray(r.services)?r.services:[]).map(x=>typeof x==='string'?x:(x.title||x.id||'')).filter(Boolean).join(', ')||'General consultation';
 return `<button type="button" class="bk-entry" data-booking-id="${escape(r.id)}">
  <div class="bk-entry-top"><strong>${escape(r.business_name||r.customer_name)}</strong><span class="bk-status ${escape(r.status)}">${escape(r.status)}</span></div>
  <small>${escape(r.customer_name)} · ${escape(r.customer_email)}</small>
  <small>${escape(details)}</small>
  <div class="bk-entry-foot"><strong>${escape(formatTime(r.start_at))}</strong><small>View details →</small></div>
 </button>`;
}
function renderList(){
 let rows=activeRows().filter(r=>dateKey(r.start_at).startsWith(monthKey()));
 if(view.selected)rows=rows.filter(r=>dateKey(r.start_at)===view.selected);
 rows.sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
 $('#bkListTitle').textContent=view.selected?new Date(view.selected+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}):'All bookings — '+monthName();
 $('#bkListSubtitle').textContent=rows.length+` booking${rows.length===1?'':'s'}`+(view.selected?' on this day':' this month');
 $('#bkClearDay').hidden=!view.selected;
 $('#bkList').innerHTML=rows.map(bookingCard).join('')||'<p class="bk-empty">No bookings match this view.</p>';
 $('#bkList').querySelectorAll('[data-booking-id]').forEach(btn=>btn.addEventListener('click',()=>openBooking(btn.dataset.bookingId)));
}
function render(){renderCalendar();renderList();updateStats();window.lucide?.createIcons();}
async function load(silent=false){
 if(!window.steadyHandsAdminSession||busy)return;
 busy=true;$('#bkRefresh').disabled=true;if(!silent)setMessage('Loading bookings…');
 const start=new Date(Date.UTC(view.year,view.month,1)-2*86400000).toISOString();
 const end=new Date(Date.UTC(view.year,view.month+1,1)+2*86400000).toISOString();
 const requested=monthKey();
 try{
  const {data,error}=await window.steadyHandsCRMClient.from(TABLE).select('id,created_at,start_at,end_at,timezone,services,business_name,customer_name,customer_email,customer_phone,customer_notes,status').gte('start_at',start).lt('start_at',end).order('start_at',{ascending:true}).limit(1000);
  if(error)throw error;
  if(requested!==monthKey())return;
  entries=(data||[]).filter(r=>dateKey(r.start_at).startsWith(requested));loaded=true;render();
  if(!silent)setMessage(entries.length?'Bookings are up to date. Auto-refresh is on.':'No bookings recorded for this month. Auto-refresh is on.');
 }catch(error){
  console.error('Bookings failed to load',error);
  $('#bkCalendar').innerHTML='';
  $('#bkList').innerHTML='<p class="bk-empty">Unable to load bookings. Check database permissions and try Refresh.</p>';
  setMessage('Bookings are not available. The admin SELECT policy for sh_consultation_bookings may still need to be installed.');
 }finally{busy=false;$('#bkRefresh').disabled=false;}
}
function row(label,value,html=false){return `<div class="bk-detail-row"><span>${escape(label)}</span><strong>${html?value:escape(value||'—')}</strong></div>`;}
function openBooking(id){
 const r=entries.find(x=>x.id===id);if(!r)return;opened=id;
 const services=(Array.isArray(r.services)?r.services:[]).map(s=>typeof s==='string'?s:s?.title||s?.id||'').filter(Boolean);
 const mail=String(r.customer_email||''),phone=String(r.customer_phone||'');
 const safeMail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)?`<a href="mailto:${encodeURIComponent(mail)}">${escape(mail)}</a>`:escape(mail);
 const safePhone=phone.replace(/[^+\d]/g,'');const phoneLink=safePhone?`<a href="tel:${escape(safePhone)}">${escape(phone)}</a>`:escape(phone);
 $('#bkDrawerBody').innerHTML=`<div class="bk-details">
  ${row('Business',r.business_name)}${row('Customer',r.customer_name)}
  ${row('Appointment (Pacific)',formatTime(r.start_at))}
  ${row('Requested timezone',r.timezone)}
  ${row('Services',services.join('\n')||'General consultation')}
  ${row('Email',safeMail,true)}${row('Phone',phoneLink,true)}
  ${row('Notes',r.customer_notes||'None')}
  ${row('Requested on',formatTime(r.created_at))}
  <div class="bk-detail-actions"><label>Booking status<select id="bkEditStatus"><option value="submitted">Submitted</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="declined">Declined</option></select></label>
  <button id="bkSaveStatus" type="button">Save status</button><p id="bkDetailMessage" class="bk-detail-message" role="status"></p></div>
 </div>`;
 $('#bkEditStatus').value=r.status;
 $('#bkSaveStatus').addEventListener('click',saveStatus);
 $('#bkOverlay').hidden=false;document.body.style.overflow='hidden';window.lucide?.createIcons();
 $('#bkEditStatus').focus();
}
function closeBooking(){$('#bkOverlay').hidden=true;opened=null;document.body.style.overflow='';}
async function saveStatus(){
 const r=entries.find(x=>x.id===opened);if(!r)return;
 const next=$('#bkEditStatus').value;if(!['submitted','confirmed','cancelled','declined'].includes(next))return;
 if(next===r.status){$('#bkDetailMessage').textContent='No changes to save.';return;}
 const btn=$('#bkSaveStatus');btn.disabled=true;$('#bkDetailMessage').textContent='Saving…';
 try{
  const {data,error}=await window.steadyHandsCRMClient.from(TABLE).update({status:next,updated_at:new Date().toISOString()}).eq('id',r.id).eq('status',r.status).select('id,status').maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('This booking was changed by someone else. Refresh the page.');
  r.status=data.status;render();showBookingToast('Booking status saved.');$('#bkDetailMessage').textContent='Saved. This updates the booking status only; no customer email was sent.';
 }catch(error){console.error('Unable to update booking',error);$('#bkDetailMessage').textContent=error.message||'Could not save the booking status.';}finally{btn.disabled=false;}
}
function init(){
 if(!window.steadyHandsAdminSession||initialized)return;
 initialized=true;
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).catch(console.warn);
 $('#bkNotify').addEventListener('click',enableBookingNotifications);
 updateBookingNotificationControl();
 setInterval(()=>{if(!document.hidden){load(true);checkNewBookings();}},20000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){load(true);checkNewBookings();}});
 $('#bkPrev').addEventListener('click',()=>move(-1));
 $('#bkNext').addEventListener('click',()=>move(1));
 $('#bkToday').addEventListener('click',()=>{const d=new Date();view.year=d.getFullYear();view.month=d.getMonth();view.selected='';load();});
 $('#bkRefresh').addEventListener('click',load);
 $('#bkClearDay').addEventListener('click',()=>{view.selected='';render();});
 $('#bkSearch').addEventListener('input',event=>{view.search=event.target.value.trim().toLowerCase();render();});
 $('#bkStatus').addEventListener('change',event=>{view.status=event.target.value;render();});
 document.querySelectorAll('[data-bk-close]').forEach(el=>el.addEventListener('click',closeBooking));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#bkOverlay').hidden)closeBooking();});
 load();checkNewBookings();
}
function move(amount){const d=new Date(view.year,view.month+amount,1);view.year=d.getFullYear();view.month=d.getMonth();view.selected='';entries=[];render();load();}
window.addEventListener('steadyhands:admin-ready',init);
if(window.steadyHandsAdminSession)init();
})();