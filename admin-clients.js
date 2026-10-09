(()=>{
const $=s=>document.querySelector(s), db=()=>window.steadyHandsCRMClient;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}};
const displayDate=v=>v?new Date(v).toLocaleDateString():'—';
const state={clients:[],requests:[],signatures:[],query:'',filter:'all',hosting:'all',team:'all',page:0,perPage:8};
const statusNames={onboarding:'Onboarding',live:'Live',needs_review:'Needs Review',waiting_on_content:'Waiting on Content',inactive:'Inactive'};
const toast=msg=>{$('#clientDataNotice').textContent=msg||''};
const icon=(name)=>'<i data-lucide="'+name+'"></i>';
const nameOf=c=>c.company_name||'Unnamed client';
const initials=v=>String(v||'C').trim().slice(0,1).toUpperCase();
const related=c=>state.requests.filter(r=>c.portal_user_id&&String(r.user_id)===String(c.portal_user_id));
const signed=c=>state.signatures.filter(r=>c.portal_user_id&&String(r.user_id)===String(c.portal_user_id));
const latest=c=>related(c)[0];
function matches(c){
 const q=state.query.trim().toLowerCase();
 return (!q||[c.company_name,c.contact_name,c.email,c.phone,c.site_url,c.assigned_to].some(v=>String(v||'').toLowerCase().includes(q)))
 &&(state.filter==='all'||(state.filter==='active'&&c.billing_status==='active')||(state.filter==='past_due'&&c.billing_status==='past_due')||c.site_status===state.filter)
 &&(state.hosting==='all'||c.hosting_plan===state.hosting)
 &&(state.team==='all'||(c.assigned_to||'Unassigned')===state.team);
}
function render(){
 const counts={all:state.clients.length,active:0,onboarding:0,live:0,needs_review:0,past_due:0};
 state.clients.forEach(c=>{if(c.billing_status==='active')counts.active++;if(c.billing_status==='past_due')counts.past_due++;if(counts[c.site_status]!==undefined)counts[c.site_status]++});
 Object.entries(counts).forEach(([k,v])=>{const el=$('#count-'+k);if(el)el.textContent=v});
 const teams=[...new Set(state.clients.map(c=>c.assigned_to||'Unassigned'))].sort();
 $('#clientTeam').innerHTML='<option value="all">All Team Members</option>'+teams.map(t=>'<option value="'+esc(t)+'" '+(state.team===t?'selected':'')+'>'+esc(t)+'</option>').join('');
 const list=state.clients.filter(matches);const pages=Math.max(1,Math.ceil(list.length/state.perPage));state.page=Math.min(state.page,pages-1);
 const slice=list.slice(state.page*state.perPage,(state.page+1)*state.perPage);
 $('#clientList').innerHTML=slice.map(c=>{
 const r=latest(c),s=signed(c).length>0;
 const contact=c.contact_name||c.email||'Not provided';
 const status=c.site_status||'onboarding';
 return '<tr data-id="'+esc(c.id)+'"><td><button class="client-company" data-open="'+esc(c.id)+'"><span class="client-avatar">'+esc(initials(nameOf(c)))+'</span><span><strong>'+esc(nameOf(c))+'</strong><small>'+esc(c.site_url||'Client account')+'</small></span></button></td>'+
 '<td><strong>'+esc(contact)+'</strong><small>'+esc(c.contact_name?c.email||'No email':'')+'</small></td>'+
 '<td><span class="client-status '+esc(status)+'">'+esc(statusNames[status]||status)+'</span></td>'+
 '<td>'+esc(({standard:'Standard',backend:'Backend',none:'Not set'})[c.hosting_plan]||'Not set')+'</td>'+
 '<td><span class="client-agreement">'+icon(s?'check-circle-2':'minus-circle')+' '+(s?'On file':'Not on file')+'</span></td>'+
 '<td>'+esc(c.assigned_to||'Unassigned')+'</td>'+
 '<td><strong>'+esc(r?displayDate(r.created_at):'—')+'</strong><small>'+esc(r?.title||r?.request_type||'')+'</small></td>'+
 '<td><button class="client-menu" data-open="'+esc(c.id)+'" aria-label="Open client details">'+icon('ellipsis')+'</button></td></tr>';
 }).join('')||'<tr><td colspan="8" class="client-empty">'+(state.clients.length?'No clients match your filters.':'No clients yet. Add a client or convert a lead to get started.')+'</td></tr>';
 $('#clientSummary').textContent=list.length?'Showing '+(state.page*state.perPage+1)+'–'+Math.min(list.length,(state.page+1)*state.perPage)+' of '+list.length+' clients':'0 clients';
 $('#clientPageCount').textContent=(state.page+1)+' / '+pages;$('#clientPrev').disabled=!state.page;$('#clientNext').disabled=state.page>=pages-1;
 document.querySelectorAll('[data-client-filter]').forEach(b=>b.classList.toggle('active',b.dataset.clientFilter===state.filter));
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openClient(b.dataset.open));
 window.lucide?.createIcons();
}
function close(){$('#clientOverlay').hidden=true;document.body.style.overflow=''}
function drawer(title,body){
 $('#clientDrawer').innerHTML='<div class="request-drawer-head"><div><span class="admin-kicker">STEADY HANDS ADMIN</span><h2>'+esc(title)+'</h2></div><button type="button" class="request-close" aria-label="Close">'+icon('x')+'</button></div><div class="request-drawer-body">'+body+'</div>';
 $('#clientOverlay').hidden=false;document.body.style.overflow='hidden';$('#clientDrawer .request-close').onclick=close;window.lucide?.createIcons();
}
const input=(label,key,value='',type='text')=>'<label class="client-field">'+esc(label)+'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value||'')+'"></label>';
const choose=(label,key,choices,value)=>'<label class="client-field">'+esc(label)+'<select name="'+key+'">'+choices.map(([v,t])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
function form(c={}){
 return '<form id="clientEditForm">'+
 input('Business name','company_name',c.company_name)+input('Contact name','contact_name',c.contact_name)+input('Email','email',c.email,'email')+input('Phone','phone',c.phone,'tel')+input('Website URL','site_url',c.site_url,'url')+
 choose('Site status','site_status',Object.entries(statusNames),c.site_status||'onboarding')+
 choose('Hosting plan','hosting_plan',[['none','Not set'],['standard','Standard'],['backend','Backend']],c.hosting_plan||'none')+
 choose('Billing status','billing_status',[['unknown','Unknown'],['active','Active'],['past_due','Past due'],['canceled','Canceled']],c.billing_status||'unknown')+
 input('Assigned team member','assigned_to',c.assigned_to)+
 '<label class="client-field">Internal notes<textarea name="notes" rows="4">'+esc(c.notes||'')+'</textarea></label>'+
 '<p id="clientFormFeedback" class="client-notice"></p><button type="submit" class="client-btn primary">Save Client</button></form>';
}
function attachForm(c){
 const formEl=$('#clientEditForm');formEl.onsubmit=async e=>{
 e.preventDefault();const btn=formEl.querySelector('button[type=submit]');btn.disabled=true;
 const data=Object.fromEntries(new FormData(formEl));
 data.company_name=String(data.company_name||'').trim();
 if(!data.company_name){$('#clientFormFeedback').textContent='Business name is required.';btn.disabled=false;return}
 Object.keys(data).forEach(k=>{if(data[k]==='')data[k]=null});
 if(c?.portal_user_id)data.portal_user_id=c.portal_user_id;
 const result=c?.id?await db().from('admin_client_records').update(data).eq('id',c.id):await db().from('admin_client_records').insert(data);
 btn.disabled=false;
 if(result.error){$('#clientFormFeedback').textContent=result.error.message;return}
 close();await load();toast('Client saved successfully.');
 };
}
function edit(c){drawer(c?.id?'Edit Client':'New Client',form(c));attachForm(c)}
async function openClient(id){
 const c=state.clients.find(x=>x.id===id);if(!c)return;
 const requests=related(c),signatures=signed(c);
 const urls=['square_invoice_url','invoice_url','square_payment_url','payment_link','payment_url','checkout_url'];
 const links=requests.flatMap(r=>urls.map(k=>safeUrl(r[k])?'<a href="'+esc(safeUrl(r[k]))+'" target="_blank" rel="noopener noreferrer">'+esc(k.replaceAll('_',' '))+' ↗</a>':'').filter(Boolean));
 drawer(nameOf(c),
 '<section class="request-detail-card"><h3>Client overview</h3><div class="request-detail-row"><span>Contact</span><strong>'+esc(c.contact_name||'—')+'</strong></div><div class="request-detail-row"><span>Email</span><strong>'+esc(c.email||'—')+'</strong></div><div class="request-detail-row"><span>Phone</span><strong>'+esc(c.phone||'—')+'</strong></div><div class="request-detail-row"><span>Website</span><strong>'+(safeUrl(c.site_url)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(safeUrl(c.site_url))+'">Open website ↗</a>':'Not set')+'</strong></div></section>'+
 '<section class="request-detail-card"><h3>Hosting & billing</h3><div class="request-detail-row"><span>Hosting</span><strong>'+esc(c.hosting_plan||'none')+'</strong></div><div class="request-detail-row"><span>Billing status</span><strong>'+esc(c.billing_status||'unknown')+'</strong></div><div class="request-detail-row"><span>Assigned to</span><strong>'+esc(c.assigned_to||'Unassigned')+'</strong></div></section>'+
 '<section class="request-detail-card"><h3>Agreement & signature</h3>'+(signatures.length?signatures.map((s,i)=>'<div class="request-detail-row"><span>'+esc(s.agreement_title||s.agreement_version||'Agreement')+'</span><button data-signature="'+i+'">View signature</button></div>').join(''):'<p class="request-notes">No signature found. This does not affect client status.</p>')+'</section>'+
 '<section class="request-detail-card"><h3>Square invoices / payment links</h3>'+(links.join('<div class="request-detail-row">')||'<p class="request-notes">No links recorded in requests.</p>')+'</section>'+
 '<section class="request-detail-card"><h3>Recent requests</h3>'+(requests.length?requests.slice(0,10).map(r=>'<div class="request-detail-row"><span>'+esc(displayDate(r.created_at))+'</span><strong>'+esc(r.title||r.request_type||'Website request')+'</strong></div>').join(''):'<p class="request-notes">No requests on file.</p>')+'</section>'+
 '<section class="request-detail-card"><h3>Internal notes</h3><p class="request-notes">'+esc(c.notes||'No notes yet.')+'</p></section>'+
 '<div class="client-drawer-actions"><button class="client-btn primary" id="clientEdit">Edit Client</button><button class="client-btn danger" id="clientRemove">Remove Client</button></div>');
 $('#clientEdit').onclick=()=>edit(c);
 $('#clientRemove').onclick=async()=>{if(!confirm('Remove '+nameOf(c)+' from Clients? This will NOT delete their portal account, requests, or signatures.'))return;const res=await db().from('admin_client_records').delete().eq('id',c.id);if(res.error){toast(res.error.message);return}close();await load();toast('Client removed from the Clients list.')};
 document.querySelectorAll('[data-signature]').forEach(b=>b.onclick=async()=>{
 const s=signatures[Number(b.dataset.signature)];b.disabled=true;
 const {data,error}=await db().from('portal_agreement_signatures').select('signature_png').eq('id',s.id).maybeSingle();b.disabled=false;
 if(error||!data?.signature_png)return alert('Signature unavailable.');
 const src=String(data.signature_png);if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src))return alert('Unsupported signature.');
 const image=document.createElement('img');image.src=src;image.alt='Saved signature';image.style='display:block;max-width:100%;background:white;border:1px solid #ddd;border-radius:10px;margin-top:10px';b.after(image);
 });
}
async function convert(){
 const existing=new Set(state.clients.map(c=>String(c.portal_user_id)).filter(x=>x!=='null'));
 const map=new Map();
 state.requests.forEach(r=>{if(r.user_id&&!existing.has(String(r.user_id))){const key=String(r.user_id);if(!map.has(key))map.set(key,{portal_user_id:key,company_name:r.company_name||'',email:r.email||r.preferred_contact_method==='email'&&r.preferred_contact_value||'',phone:r.phone||'',contact_name:r.contact_name||''})}});
 const choices=[...map.values()];
 drawer('Convert Lead to Client','<p class="request-notes">Choose a portal lead to create a true client record. Signatures do not control client status.</p><label class="client-field">Portal lead<select id="clientConvertPick"><option value="">Choose a lead…</option>'+choices.map((x,i)=>'<option value="'+i+'">'+esc(x.company_name||x.email||x.portal_user_id)+'</option>').join('')+'</select></label><button id="clientConvertNext" class="client-btn primary">Continue</button>');
 $('#clientConvertNext').onclick=()=>{const i=$('#clientConvertPick').value;if(i==='')return;edit({...choices[Number(i)],site_status:'onboarding',hosting_plan:'none',billing_status:'unknown'})};
}
async function load(){
 const client=db();if(!client)return;
 const res=await client.from('admin_client_records').select('*').order('company_name',{ascending:true});
 if(res.error){toast('Client records are not ready: '+res.error.message+'. Run sql/admin-client-records.sql in your main CRM Supabase SQL editor.');$('#clientList').innerHTML='<tr><td colspan="8" class="client-empty">Client records unavailable. Database setup is required.</td></tr>';$('#clientSummary').textContent='Unable to load';return}
 state.clients=res.data||[];
 const [r,s]=await Promise.all([
 client.from('portal_service_requests').select('*').order('created_at',{ascending:false}),
 client.from('portal_agreement_signatures').select('id,user_id,agreement_title,agreement_version,created_at').order('created_at',{ascending:false})
 ]);
 state.requests=r.data||[];state.signatures=s.data||[];
 toast(r.error||s.error?'Some request or signature details could not be loaded. Client records are still available.':'');
 render();
}
$('#clientSearch').oninput=e=>{state.query=e.target.value;state.page=0;render()};
document.querySelectorAll('[data-client-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.clientFilter;state.page=0;render()});
$('#clientHosting').onchange=e=>{state.hosting=e.target.value;state.page=0;render()};
$('#clientTeam').onchange=e=>{state.team=e.target.value;state.page=0;render()};
$('#clientPrev').onclick=()=>{state.page--;render()};
$('#clientNext').onclick=()=>{state.page++;render()};
$('#newClient').onclick=()=>edit();
$('#convertClient').onclick=convert;
$('#clientOverlay').onclick=e=>{if(e.target.id==='clientOverlay')close()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#clientOverlay').hidden)close()});
const start=()=>load().catch(e=>toast('Unable to load clients: '+e.message));
if(window.steadyHandsAdminSession)start();else window.addEventListener('steadyhands:admin-ready',start,{once:true});
})();