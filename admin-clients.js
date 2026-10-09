(()=>{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'"/g,'&quot;').replace(/'/g,'&#39;');
const date=v=>v?new Date(v).toLocaleDateString():'—';
const state={clients:[],q:'',filter:'all',signatures:[],selected:null};
const paymentFields=['square_invoice_url','invoice_url','square_payment_url','payment_link','payment_url','checkout_url'];
const validLink=v=>{try{const url=new URL(String(v||''));return url.protocol==='https:'?url.href:''}catch{return ''}};
function render(){
 const term=state.q.toLowerCase().trim();
 const filtered=state.clients.filter(c=>{
  const match=!term||[c.company,c.email,c.phone,c.id].some(v=>String(v||'').toLowerCase().includes(term));
  if(!match)return false;
  if(state.filter==='signed')return c.signatures.length>0;
  if(state.filter==='pending')return c.signatures.length===0;
  return true;
 });
 $('#clientSummary').textContent=state.clients.length+' client accounts · '+state.clients.filter(c=>c.signatures.length).length+' with recorded signatures';
 $('#clientList').innerHTML=filtered.length?filtered.map(c=>'<button type="button" class="admin-user-card" data-client="'+esc(c.id)+'"><span class="admin-user-avatar">'+esc(c.company.slice(0,1)||'C')+'</span><span class="admin-user-card-main"><span class="admin-user-card-head"><strong>'+esc(c.company)+'</strong><span class="admin-user-role">'+(c.signatures.length?'Signature on file':'No signature')+'</span></span><small>'+esc(c.email||'Account '+c.id)+'</small><span class="admin-user-card-stats"><b>'+c.requests.length+' requests</b><b>'+c.signatures.length+' signature records</b></span></span><i data-lucide="chevron-right"></i></button>').join(''):'<div class="cc-empty">No matching clients.</div>';
 $('#clientList').querySelectorAll('[data-client]').forEach(b=>b.addEventListener('click',()=>openClient(b.dataset.client)));
 window.lucide?.createIcons();
}
function linkRow(label,link){
 const href=validLink(link);
 return href?'<div class="request-detail-row"><span>'+esc(label)+'</span><strong><a target="_blank" rel="noopener noreferrer" href="'+esc(href)+'">Open verified link ↗</a></strong></div>':'';
}
async function openClient(id){
 const c=state.clients.find(x=>x.id===id);if(!c)return;
 state.selected=id;const overlay=$('#clientOverlay'),drawer=$('#clientDrawer');
 const links=c.requests.flatMap(r=>paymentFields.filter(k=>validLink(r[k])).map(k=>linkRow(k.replaceAll('_',' '),r[k]))).join('');
 drawer.innerHTML='<div class="request-drawer-head"><div><span class="admin-kicker">CLIENT RECORD</span><h2>'+esc(c.company)+'</h2><p>'+esc(c.email||'Client account')+'</p></div><button class="request-close" type="button" aria-label="Close"><i data-lucide="x"></i></button></div><div class="request-drawer-body">'+
 '<section class="request-detail-card"><h3>Client information</h3><div class="request-detail-row"><span>Account ID</span><strong>'+esc(c.id)+'</strong></div><div class="request-detail-row"><span>Business</span><strong>'+esc(c.company)+'</strong></div><div class="request-detail-row"><span>Contact</span><strong>'+esc(c.email||'Not recorded')+'</strong></div><div class="request-detail-row"><span>Phone</span><strong>'+esc(c.phone||'Not recorded')+'</strong></div></section>'+
 '<section class="request-detail-card"><h3>Agreement & signatures</h3><p class="request-notes">Signatures currently come from the portal’s sample-agreement process. A recorded signature is not proof of a finalized service contract.</p><div id="clientSignatureArea">'+(c.signatures.length?c.signatures.map((r,i)=>'<div class="request-detail-row"><span>'+esc(r.agreement_title||r.agreement_version||'Agreement')+' · '+esc(date(r.created_at))+'</span><button type="button" data-signature="'+i+'">View signature</button></div>').join(''):'<p class="request-notes">No saved signatures found.</p>')+'</div></section>'+
 '<section class="request-detail-card"><h3>Square invoices & payment links</h3>'+(links||'<p class="request-notes">No Square invoice or payment links are recorded in these request records. No payment status is assumed.</p>')+'</section>'+
 '<section class="request-detail-card"><h3>Hosting & website requests</h3>'+(c.requests.length?c.requests.map(r=>'<div class="request-detail-row"><span>'+esc(r.title||r.request_type||'Website request')+'</span><strong>'+esc(r.status||'Submitted')+'</strong></div>').join(''):'<p class="request-notes">No requests on file.</p>')+'</section>'+
 '</div>';
 overlay.hidden=false;document.body.style.overflow='hidden';drawer.querySelector('.request-close').onclick=close;window.lucide?.createIcons();
 drawer.querySelectorAll('[data-signature]').forEach(btn=>btn.onclick=async()=>{
  const item=c.signatures[Number(btn.dataset.signature)],box=$('#clientSignatureArea');
  btn.disabled=true;btn.textContent='Loading signature…';
  const {data,error}=await window.steadyHandsCRMClient.from('portal_agreement_signatures').select('signature_png').eq('id',item.id).maybeSingle();
  btn.disabled=false;btn.textContent='View signature';
  if(error||!data?.signature_png){box.insertAdjacentHTML('beforeend','<p class="request-notes">Signature unavailable or access denied.</p>');return}
  const png=String(data.signature_png);if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)){box.insertAdjacentHTML('beforeend','<p class="request-notes">Unsupported signature format.</p>');return}
  const img=document.createElement('img');img.src=png;img.alt='Saved client signature';img.style='display:block;max-width:100%;background:#fff;border:1px solid #ddd;border-radius:12px;margin-top:12px';box.append(img);
 });
}
function close(){$('#clientOverlay').hidden=true;document.body.style.overflow=''}
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const [req,sig]=await Promise.all([
  c.from('portal_service_requests').select('*').order('created_at',{ascending:false}),
  c.from('portal_agreement_signatures').select('id,user_id,agreement_title,agreement_version,created_at').order('created_at',{ascending:false})
 ]);
 if(req.error&&sig.error){$('#clientList').innerHTML='<div class="cc-empty">Unable to load client records. '+esc(req.error.message)+'</div>';return}
 const map=new Map();
 const ensure=id=>{const k=String(id);if(!map.has(k))map.set(k,{id:k,company:'Client account',email:'',phone:'',requests:[],signatures:[]});return map.get(k)};
 for(const r of req.data||[]){if(!r.user_id)continue;const x=ensure(r.user_id);x.requests.push(r);if(r.company_name)x.company=r.company_name;if(r.preferred_contact_method==='email'&&r.preferred_contact_value)x.email=r.preferred_contact_value;if(r.preferred_contact_method==='text'&&r.preferred_contact_value)x.phone=r.preferred_contact_value}
 for(const r of sig.data||[]){if(!r.user_id)continue;ensure(r.user_id).signatures.push(r)}
 state.clients=[...map.values()].sort((a,b)=>a.company.localeCompare(b.company));render();
 if(req.error||sig.error){$('#clientDataNotice').textContent='Some records could not be accessed. '+(req.error?.message||sig.error?.message)}
}
$('#clientSearch').addEventListener('input',e=>{state.q=e.target.value;render()});
document.querySelectorAll('[data-client-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.clientFilter;document.querySelectorAll('[data-client-filter]').forEach(x=>x.classList.toggle('active',x===b));render()});
$('#clientOverlay').onclick=e=>{if(e.target.id==='clientOverlay')close()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#clientOverlay').hidden)close()});
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();