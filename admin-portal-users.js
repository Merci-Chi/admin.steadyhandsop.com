(()=>{
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const records=new Map();let query='';
function ensure(id){const key=String(id);if(!records.has(key))records.set(key,{id:key,company:'',email:'',phone:'',requests:[],signatures:[],client:false});return records.get(key)}
function show(){
 const q=query.trim().toLowerCase();const entries=[...records.values()].filter(u=>!q||[u.company,u.email,u.phone,u.id].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>(a.company||a.email||a.id).localeCompare(b.company||b.email||b.id));
 $('#portalUserList').innerHTML=entries.map(u=>{
 const r=u.requests[0];return '<tr><td><span class="client-company"><span class="client-avatar">'+esc((u.company||u.email||'U').slice(0,1).toUpperCase())+'</span><span><strong>'+esc(u.company||'Portal account')+'</strong><small>'+esc(u.id)+'</small></span></span></td><td><strong>'+esc(u.email||'Not available')+'</strong><small>'+esc(u.phone||'')+'</small></td><td><span class="client-status '+(u.client?'live':'onboarding')+'">'+(u.client?'Client':'Portal user')+'</span></td><td>'+u.requests.length+'</td><td>'+u.signatures.length+'</td><td>'+esc(r?.created_at?new Date(r.created_at).toLocaleDateString():'—')+'</td></tr>';
 }).join('')||'<tr><td colspan="6" class="client-empty">No matching portal users found.</td></tr>';
 $('#portalUserSummary').textContent=entries.length+' portal users visible';
}
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const [req,sig,clients]=await Promise.all([
 c.from('portal_service_requests').select('user_id,company_name,email,phone,preferred_contact_method,preferred_contact_value,created_at').order('created_at',{ascending:false}),
 c.from('portal_agreement_signatures').select('user_id,id,created_at'),
 c.from('admin_client_records').select('portal_user_id,company_name,email,phone')
 ]);
 if(req.error&&sig.error&&clients.error){$('#portalUserNotice').textContent='Could not read portal records: '+req.error.message;$('#portalUserList').innerHTML='<tr><td colspan="6">Unable to load users.</td></tr>';return}
 for(const r of req.data||[]){if(!r.user_id)continue;const u=ensure(r.user_id);u.requests.push(r);u.company||=r.company_name||'';u.email||=r.email||(r.preferred_contact_method==='email'?r.preferred_contact_value:'')||'';u.phone||=r.phone||(r.preferred_contact_method==='text'?r.preferred_contact_value:'')||''}
 for(const s of sig.data||[]){if(s.user_id)ensure(s.user_id).signatures.push(s)}
 for(const a of clients.data||[]){if(!a.portal_user_id)continue;const u=ensure(a.portal_user_id);u.client=true;u.company=a.company_name||u.company;u.email=a.email||u.email;u.phone=a.phone||u.phone}
 if(req.error||sig.error||clients.error)$('#portalUserNotice').textContent='Some records are unavailable. This page shows identifiable portal accounts with requests, signatures, or client records; it is not a complete list of authentication accounts.';
 else $('#portalUserNotice').textContent='Showing portal accounts identified from requests, signatures, and client records. Accounts without any of these records may not appear.';
 show();
}
$('#portalUserSearch').addEventListener('input',e=>{query=e.target.value;show()});
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();