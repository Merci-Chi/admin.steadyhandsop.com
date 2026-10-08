(()=>{
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate=v=>v?new Date(v).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'';
const statusLabel=v=>({new:'New',in_progress:'In Progress',completed:'Completed',cancelled:'Cancelled'})[v]||String(v||'New');
const initials=v=>String(v||'?').trim().slice(0,1).toUpperCase();
let rows=[],filter='new',query='';

function normalizeServices(value){
 if(Array.isArray(value))return value;
 if(typeof value==='string'){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed}catch{} return value.split(',').map(x=>x.trim()).filter(Boolean)}
 return [];
}
function matches(r){
 if(filter!=='all'&&String(r.status||'new')!==filter)return false;
 const q=query.trim().toLowerCase();if(!q)return true;
 return [r.company_name,r.contact_name,r.email,r.phone,r.business_category,r.website_url].some(v=>String(v||'').toLowerCase().includes(q));
}
function badge(status){return '<span class="request-status '+esc(status||'new')+'">'+esc(statusLabel(status||'new'))+'</span>'}
function render(){
 const list=document.getElementById('requestList');
 const visible=rows.filter(matches);
 const counts={new:0,in_progress:0,completed:0};
 rows.forEach(r=>{if(counts[r.status]!=null)counts[r.status]++});
 document.getElementById('requestSummary').innerHTML=
  '<span><strong>'+counts.new+'</strong> New</span><span><strong>'+counts.in_progress+'</strong> In Progress</span><span><strong>'+counts.completed+'</strong> Completed</span>';
 list.innerHTML=visible.length?visible.map(r=>`
  <button class="admin-request-card" type="button" data-request-id="${esc(r.id)}">
    <span class="request-avatar">${esc(initials(r.company_name))}</span>
    <span class="request-card-main">
      <strong>${esc(r.company_name||'Unnamed business')}</strong>
      <small>${esc(r.contact_name||'No contact')} · ${esc(r.business_category||'No category')}</small>
      <small>${esc(r.phone||r.email||'')}</small>
    </span>
    <span class="request-card-side">${badge(r.status)}<time>${esc(fmtDate(r.created_at))}</time></span>
    <i data-lucide="chevron-right"></i>
  </button>`).join(''):'<div class="cc-empty">No requests found.</div>';
 window.lucide?.createIcons();
}
function colorRow(label,value){
 if(!value)return '';
 return '<div class="request-detail-row"><span>'+esc(label)+'</span><strong class="request-color-value"><i style="background:'+esc(value)+'"></i>'+esc(value)+'</strong></div>';
}
function openRequest(id){
 const r=rows.find(x=>String(x.id)===String(id));if(!r)return;
 const services=normalizeServices(r.services);
 const colors=r.color_preferences||{};
 const socials=[
  ['Website',r.website_url],['Instagram',r.instagram_url],['Facebook',r.facebook_url],['TikTok',r.tiktok_url],['Yelp / Google',r.yelp_or_google_url]
 ].filter(([,v])=>v);
 const overlay=document.getElementById('requestOverlay'),drawer=document.getElementById('requestDrawer');
 drawer.innerHTML=`
  <div class="request-drawer-head">
    <div><span class="admin-kicker">WEBSITE REQUEST</span><h2>${esc(r.company_name||'Website Request')}</h2><p>${esc(fmtDate(r.created_at))}</p></div>
    <button type="button" class="request-close" aria-label="Close"><i data-lucide="x"></i></button>
  </div>
  <div class="request-drawer-body">
    <section class="request-detail-card">
      <h3>Contact</h3>
      <div class="request-detail-row"><span>Name</span><strong>${esc(r.contact_name||'')}</strong></div>
      <div class="request-detail-row"><span>Email</span><strong><a href="mailto:${esc(r.email||'')}">${esc(r.email||'')}</a></strong></div>
      <div class="request-detail-row"><span>Phone</span><strong><a href="tel:${esc(String(r.phone||'').replace(/\D/g,''))}">${esc(r.phone||'')}</a></strong></div>
      <div class="request-detail-row"><span>Business type</span><strong>${esc(r.business_category||'')}</strong></div>
      <div class="request-detail-row"><span>Service area</span><strong>${esc(r.address_or_service_area||'')}</strong></div>
    </section>
    <section class="request-detail-card">
      <h3>Services</h3>
      <div class="request-service-tags">${services.length?services.map(s=>'<span>'+esc(s)+'</span>').join(''):'<small>No services listed.</small>'}</div>
    </section>
    <section class="request-detail-card">
      <h3>Color preferences</h3>
      ${colorRow('Primary',colors.primary)}
      ${colorRow('Secondary',colors.secondary)}
      ${colorRow('Accent',colors.accent)}
      <div class="request-detail-row"><span>Avoid</span><strong>${esc(colors.avoid||'None listed')}</strong></div>
    </section>
    <section class="request-detail-card">
      <h3>Links</h3>
      ${socials.length?socials.map(([label,url])=>'<div class="request-detail-row"><span>'+esc(label)+'</span><strong><a href="'+esc(url)+'" target="_blank" rel="noopener">Open link</a></strong></div>').join(''):'<small>No links supplied.</small>'}
    </section>
    <section class="request-detail-card">
      <h3>Other specifications</h3>
      <p class="request-notes">${esc(r.specifications_notes||'No additional notes.')}</p>
    </section>
    <section class="request-status-actions">
      <h3>Status</h3>
      <div>
        <button type="button" data-set-status="new" class="${r.status==='new'?'active':''}">New</button>
        <button type="button" data-set-status="in_progress" class="${r.status==='in_progress'?'active':''}">In Progress</button>
        <button type="button" data-set-status="completed" class="${r.status==='completed'?'active':''}">Completed</button>
      </div>
    </section>
  </div>`;
 overlay.hidden=false;document.body.style.overflow='hidden';window.lucide?.createIcons();
 drawer.querySelector('.request-close')?.addEventListener('click',closeDrawer);
 drawer.querySelectorAll('[data-set-status]').forEach(btn=>btn.addEventListener('click',()=>setStatus(r.id,btn.dataset.setStatus)));
}
function closeDrawer(){document.getElementById('requestOverlay').hidden=true;document.body.style.overflow=''}
async function setStatus(id,status){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const {error}=await c.from('website_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id);
 if(error){alert(error.message||'Could not update request.');return}
 const r=rows.find(x=>String(x.id)===String(id));if(r)r.status=status;
 closeDrawer();render();
}
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const {data,error}=await c.from('website_requests').select('*').order('created_at',{ascending:false});
 if(error){document.getElementById('requestList').innerHTML='<div class="cc-empty">Unable to load requests.<br>'+esc(error.message||'')+'</div>';return}
 rows=data||[];render();
}
document.querySelectorAll('[data-request-filter]').forEach(btn=>btn.addEventListener('click',()=>{
 filter=btn.dataset.requestFilter;document.querySelectorAll('[data-request-filter]').forEach(x=>x.classList.toggle('active',x===btn));render();
}));
document.getElementById('requestSearch')?.addEventListener('input',e=>{query=e.target.value;render()});
document.getElementById('requestList')?.addEventListener('click',e=>{const card=e.target.closest('[data-request-id]');if(card)openRequest(card.dataset.requestId)});
document.getElementById('requestOverlay')?.addEventListener('click',e=>{if(e.target.id==='requestOverlay')closeDrawer()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('requestOverlay')?.hidden)closeDrawer()});
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();