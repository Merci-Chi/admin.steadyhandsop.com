(()=>{
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate=v=>v?new Date(v).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'';
const statusLabel=v=>({new:'New',in_progress:'In Progress',completed:'Completed',cancelled:'Cancelled',submitted:'New',under_review:'Under Review',declined:'Declined'})[v]||String(v||'New');
const initials=v=>String(v||'?').trim().slice(0,1).toUpperCase();
let rows=[],filter='all',query='';
const READ_STORAGE_KEY='steadyhands.website_requests.read.v1';
const readIds=new Set();
try{JSON.parse(localStorage.getItem(READ_STORAGE_KEY)||'[]').forEach(id=>readIds.add(String(id)))}catch{}
function markRead(id){
 const key=String(id);
 if(readIds.has(key))return;
 readIds.add(key);
 try{localStorage.setItem(READ_STORAGE_KEY,JSON.stringify([...readIds]))}catch{}
}

function normalizeServices(value){
 if(Array.isArray(value))return value;
 if(typeof value==='string'){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed}catch{} return value.split(',').map(x=>x.trim()).filter(Boolean)}
 return [];
}
function matches(r){
 if(filter!=='all'&&String(r.status||'new')!==filter&&!(filter==='new'&&r.status==='submitted')&&!(filter==='in_progress'&&r.status==='under_review'))return false;
 const q=query.trim().toLowerCase();if(!q)return true;
 return [r.company_name,r.contact_name,r.email,r.phone,r.business_category,r.website_url,r.title,r.details,r.request_type].some(v=>String(v||'').toLowerCase().includes(q));
}
function badge(status){return '<span class="request-status '+esc(status||'new')+'">'+esc(statusLabel(status||'new'))+'</span>'}
function render(){
 const list=document.getElementById('requestList');
 const visible=rows.filter(matches);
 const counts={new:0,in_progress:0,completed:0};
 rows.forEach(r=>{const status=r.status==='submitted'?'new':r.status==='under_review'?'in_progress':r.status;if(counts[status]!=null)counts[status]++});
 document.getElementById('requestSummary').innerHTML=
  '<span><strong>'+counts.new+'</strong> New</span><span><strong>'+counts.in_progress+'</strong> In Progress</span><span><strong>'+counts.completed+'</strong> Completed</span>';
 list.innerHTML=visible.length?visible.map(r=>{
  const unread=['new','submitted'].includes(String(r.status||'new'))&&!readIds.has(String(r.id));
  const cardClass=unread?'is-unread':'is-read';
  return `
  <article class="request-list-card ${cardClass}" data-row-id="${esc(r.id)}">
    <button class="request-card-open" type="button" data-request-id="${esc(r.id)}" aria-label="Open ${esc(r.company_name||'website request')}">
      <span class="request-avatar">${esc(initials(r.company_name))}</span>
      <span class="request-card-main">
        <strong>${esc(r.company_name||'Unnamed business')}</strong>
        <small>${esc(r._source==='portal'?'Client Portal · '+(r.request_type||'Request'):((r.contact_name||'No contact')+' · '+(r.business_category||'No category')))}</small>
        <small>${esc(r._source==='portal'?(r.title||''):r.phone||r.email||'')}</small>
      </span>
      <span class="request-card-side"><span class="request-status ${esc(r.status||'new')} ${unread?'status-unread':'status-read'}">${esc(statusLabel(r.status||'new'))}</span><time>${esc(fmtDate(r.created_at))}</time></span>
    </button>
    <span class="request-row-actions">
      <button class="request-row-delete" type="button" data-delete-request="${esc(r.id)}" ${r._source==='portal'?'hidden':''} aria-label="Delete ${esc(r.company_name||'website request')}" title="Delete request"><i data-lucide="trash-2"></i></button>
      <button class="request-row-open" type="button" data-request-id="${esc(r.id)}" aria-label="Open request details" title="Open request"><i data-lucide="chevron-right"></i></button>
    </span>
  </article>`;
 }).join(''):'<div class="cc-empty">No requests found.</div>';
 window.lucide?.createIcons();
}
function colorRow(label,value){
 if(!value)return '';
 return '<div class="request-detail-row"><span>'+esc(label)+'</span><strong class="request-color-value"><i style="background:'+esc(value)+'"></i>'+esc(value)+'</strong></div>';
}

function previewDelivery(r,drawer){
 const preferred=String(r.preferred_contact_method||r.preferred_contact||r.delivery_method||r.contact_method||r.reply_method||'').toLowerCase();
 const method=preferred.includes('text')||preferred.includes('sms')?'text':preferred.includes('mail')?'email':'';
 const first=String(r.contact_name||'there').trim().split(/\s+/)[0];
 const key=String(r.site_key||'').trim();
 const body=key=>`Hi ${first}! Your website preview from Steady Hands is ready! Visit https://viewyoursite.today and enter your site key: ${key||'[SITE KEY]'}. We'd love your feedback! — Steady Hands`;
 const section=document.createElement('section');
 section.className='request-detail-card';
 section.innerHTML=`<h3>Send website preview</h3><p style="color:#64748b;font-size:13px">Paste a site key to prepare a draft for your client.</p>
 <div class="request-detail-row"><span>Preferred contact</span><strong>${method==='text'?'Text':method==='email'?'Email':'Not recorded'}</strong></div>
 <label style="display:block;font-weight:700;margin:12px 0 6px" for="previewSiteKey">Site key</label>
 <input id="previewSiteKey" placeholder="Paste site key" value="${esc(key)}" style="width:100%;padding:12px;border:1px solid #d9e2ed;border-radius:12px;font:inherit" />
 <label style="display:block;font-weight:700;margin:12px 0 6px" for="previewMessage">Message draft</label>
 <textarea id="previewMessage" rows="6" style="width:100%;padding:12px;border:1px solid #d9e2ed;border-radius:12px;font:inherit;resize:vertical">${esc(body(key))}</textarea>
 <div style="display:flex;gap:9px;margin-top:10px"><button id="previewCopy" type="button" style="flex:1;padding:12px;background:#eff5fb;border:0;border-radius:12px;font-weight:800">Copy draft</button>
 <button id="previewOpen" type="button" style="flex:1;padding:12px;background:#102945;color:#fff;border:0;border-radius:12px;font-weight:800">${method==='email'?'Open Email':method==='text'?'Open Messages':'Choose & Open'}</button></div>
 <p id="previewFeedback" style="font-size:12px;color:#64748b;margin-top:8px" role="status">Your email or messaging app will open a draft. Nothing is sent automatically.</p>`;
 const status=drawer.querySelector('.request-status-actions');
 (status||drawer.querySelector('.request-drawer-body')).before(section);
 const field=section.querySelector('#previewSiteKey'),draft=section.querySelector('#previewMessage'),feedback=section.querySelector('#previewFeedback');
 field.addEventListener('input',()=>{draft.value=body(field.value.trim())});
 section.querySelector('#previewCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(draft.value);feedback.textContent='Copied to clipboard!'}catch{draft.focus();draft.select();feedback.textContent='Copy the selected text.'}});
 section.querySelector('#previewOpen').addEventListener('click',()=>{
  if(!field.value.trim()){feedback.textContent='Enter a site key first.';field.focus();return}
  const selected=method||(window.confirm('Preferred contact was not recorded. OK for email, Cancel for text.')?'email':'text');
  const target=selected==='email'?String(r.email||'').trim():String(r.phone||'').replace(/[^+\d]/g,'');
  if(!target){feedback.textContent='No '+(selected==='email'?'email address':'phone number')+' on this request. Copy the draft instead.';return}
  const link=selected==='email'?'mailto:'+encodeURIComponent(target)+'?subject='+encodeURIComponent('Your Steady Hands website preview')+'&body='+encodeURIComponent(draft.value):'sms:'+target+'?'+(/iPad|iPhone|iPod/i.test(navigator.userAgent)?'&':'')+'body='+encodeURIComponent(draft.value);
  window.location.href=link;
 });
}
function openRequest(id){
 const r=rows.find(x=>String(x.id)===String(id));if(!r)return;
 markRead(r.id);
 render();
 if(r._source==='portal'){openPortalRequest(r);return;}
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
 previewDelivery(r,drawer);
 drawer.querySelector('.request-close')?.addEventListener('click',closeDrawer);
 drawer.querySelectorAll('[data-set-status]').forEach(btn=>btn.addEventListener('click',()=>setStatus(r.id,btn.dataset.setStatus)));
}
function openPortalRequest(r){
 const overlay=document.getElementById('requestOverlay'),drawer=document.getElementById('requestDrawer');
 drawer.innerHTML=`
 <div class="request-drawer-head"><div><span class="admin-kicker">CLIENT PORTAL · ${esc(String(r.request_type||'request').replaceAll('_',' ').toUpperCase())}</span><h2>${esc(r.company_name||'Customer request')}</h2><p>${esc(fmtDate(r.created_at))}</p></div><button type="button" class="request-close" aria-label="Close"><i data-lucide="x"></i></button></div>
 <div class="request-drawer-body">
 <section class="request-detail-card"><h3>${esc(r.title||'Request')}</h3><p class="request-notes">${esc(r.details||'No details supplied.')}</p></section>
 <section class="request-detail-card"><h3>Portal account</h3><div class="request-detail-row"><span>Account ID</span><strong>${esc(r.user_id)}</strong></div><p class="request-notes">Company name is self-reported until ownership is verified.</p></section>
 <section class="request-status-actions"><h3>Status</h3><div>
 ${['submitted','under_review','in_progress','completed','declined'].map(status=>`<button type="button" data-set-status="${status}" class="${r.status===status?'active':''}">${esc(statusLabel(status))}</button>`).join('')}
 </div></section></div>`;
 overlay.hidden=false;document.body.style.overflow='hidden';window.lucide?.createIcons();
 drawer.querySelector('.request-close')?.addEventListener('click',closeDrawer);
 drawer.querySelectorAll('[data-set-status]').forEach(btn=>btn.addEventListener('click',()=>setStatus(r.id,btn.dataset.setStatus)));
}
function closeDrawer(){document.getElementById('requestOverlay').hidden=true;document.body.style.overflow=''}
async function deleteRequest(id, triggerButton){
 const request=rows.find(x=>String(x.id)===String(id));
 if(!request)return;
 const business=String(request.company_name||'this website request');
 if(!window.confirm('Delete the request for "'+business+'" permanently? This cannot be undone.'))return;
 if(request._source==='portal'){alert('Portal requests are retained for customer history and cannot be deleted here.');return}
 const c=window.steadyHandsCRMClient;
 if(!c){alert('Admin database connection is unavailable.');return}
 const button=triggerButton||document.querySelector('.request-row-delete[data-delete-request="'+String(id).replace(/"/g,'\\"')+'"]');
 if(button){button.disabled=true;button.setAttribute('aria-busy','true')}
 const {data,error}=await c.from('website_requests').delete().eq('id',id).select('id');
 if(error){
  if(button){button.disabled=false;button.removeAttribute('aria-busy')}
  alert(error.message||'Could not delete the request. Make sure you are signed in as an administrator.');
  return;
 }
 if(!data||!data.some(x=>String(x.id)===String(id))){
  if(button){button.disabled=false;button.removeAttribute('aria-busy')}
  alert('This request was not deleted. Your account may not have administrator delete permission, or the request has already been removed.');
  return;
 }
 rows=rows.filter(x=>String(x.id)!==String(id));
 closeDrawer();
 render();
}
async function setStatus(id,status){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const r=rows.find(x=>String(x.id)===String(id));
 const {error}=r?._source==='portal' ? await c.from('portal_service_requests').update({status}).eq('id',id) : await c.from('website_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id);
 if(error){alert(error.message||'Could not update request.');return}
 if(r)r.status=status;
 closeDrawer();render();
}
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const [web,portal]=await Promise.all([c.from('website_requests').select('*').order('created_at',{ascending:false}),c.from('portal_service_requests').select('id,user_id,company_name,request_type,title,details,status,created_at').order('created_at',{ascending:false})]);
 if(web.error||portal.error){document.getElementById('requestList').innerHTML='<div class="cc-empty">Unable to load requests.<br>'+esc(web.error?.message||portal.error?.message||'')+'</div>';return}
 rows=[...(web.data||[]).map(r=>({...r,_source:'website'})),...(portal.data||[]).map(r=>({...r,_source:'portal'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));render();
}
document.querySelectorAll('[data-request-filter]').forEach(btn=>btn.addEventListener('click',()=>{
 filter=btn.dataset.requestFilter;document.querySelectorAll('[data-request-filter]').forEach(x=>x.classList.toggle('active',x===btn));render();
}));
document.getElementById('requestSearch')?.addEventListener('input',e=>{query=e.target.value;render()});
document.getElementById('requestList')?.addEventListener('click',e=>{
 const deleteButton=e.target.closest('[data-delete-request]');
 if(deleteButton){e.preventDefault();e.stopPropagation();deleteRequest(deleteButton.dataset.deleteRequest,deleteButton);return}
 const openButton=e.target.closest('[data-request-id]');
 if(openButton){e.preventDefault();openRequest(openButton.dataset.requestId)}
});
document.getElementById('requestList')?.addEventListener('keydown',e=>{
 const openButton=e.target.closest('[data-request-id]');
 if(openButton&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openRequest(openButton.dataset.requestId)}
});
document.getElementById('requestList')?.addEventListener('keydown',e=>{
 const card=e.target.closest('[data-request-id]');
 if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openRequest(card.dataset.requestId)}
});
document.getElementById('requestOverlay')?.addEventListener('click',e=>{if(e.target.id==='requestOverlay')closeDrawer()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('requestOverlay')?.hidden)closeDrawer()});
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();