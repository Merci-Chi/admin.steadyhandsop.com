(()=>{"use strict";const client=()=>window.steadyHandsCRMClient;const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let users=[],q='';const notice=document.getElementById('onboardingNotice');const list=document.getElementById('onboardingList');async function api(body){const {data,error}=await client().functions.invoke('admin-onboarding',{body});if(error){let message=error.message;try{const body=await error.context?.json?.();message=body?.error||message}catch{}throw Error(message)}if(data?.error)throw Error(data.error);return data}function render(){let matches=users.filter(u=>[u.name,u.email,u.role].some(x=>String(x||'').toLowerCase().includes(q)));list.innerHTML=matches.map(u=>'<article class="admin-user-card" style="cursor:default;display:flex;align-items:center;gap:12px;padding:16px;margin-bottom:10px"><span class="admin-user-avatar">'+esc((u.name||u.email||'U').slice(0,1).toUpperCase())+'</span><span class="admin-user-card-main" style="flex:1;min-width:0"><strong>'+esc(u.name||'Unnamed employee')+'</strong><small style="display:block">'+esc(u.email||'')+'</small><small style="display:block">'+esc(u.role||'')+' · '+(u.complete?'Completed':u.step==null?'Not started':'Step '+(u.step+1)+' of 5')+' · '+esc(u.trainingCompleted||0)+' training lessons</small></span><button type="button" data-view="'+esc(u.id)+'" style="padding:10px;border:1px solid #8ba9c4;border-radius:8px;background:transparent;color:inherit">View details</button><button type="button" data-reset="'+esc(u.id)+'" style="padding:10px;border:1px solid #b95c5c;border-radius:8px;color:#b94343;background:transparent">Reset onboarding</button></article>').join('')||'<div class="cc-empty">No onboarding records found.</div>';list.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));list.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>reset(b.dataset.reset));window.lucide?.createIcons()}const label=k=>String(k).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const readable=v=>v===null||v===undefined||v===''?'Not provided':typeof v==='boolean'?(v?'Yes':'No'):Array.isArray(v)?(v.length?v.map(readable).join(', '):'Not provided'):typeof v==='object'?JSON.stringify(v,null,2):String(v);
function rowsFor(obj){return Object.entries(obj||{}).map(([k,v])=>'<div class="onboard-detail-row"><dt>'+esc(label(k))+'</dt><dd>'+esc(readable(v))+'</dd></div>').join('')||'<p class="onboard-muted">Not provided yet.</p>';}
async function view(id){
 const u=users.find(x=>x.id===id);if(!u)return;
 const overlay=document.getElementById('onboardingDetailOverlay'),content=document.getElementById('onboardingDetailBody');
 overlay.hidden=false;content.innerHTML='<p>Loading submitted information…</p>';
 document.getElementById('onboardingDetailTitle').textContent=u.name||u.email||'Employee';
 document.getElementById('onboardingDetailSubtitle').textContent=u.email||'';
 try{

 const data=await api({action:'details',userId:id});
 const r=data.record||{};
 const onboarding=data.onboarding||{};
 const progress=data.progress||{};
 const training=data.training||{};
 const section=(title,body)=>'<section class="onboard-detail-section"><h3>'+esc(title)+'</h3><dl>'+body+'</dl></section>';
 const isSubmitted=Boolean(onboarding.complete);
 const info=data.personalInformation||{};
 const work=data.workPreferences||{};
 const agreement=data.agreement||{};
 const payment=data.paymentPreferences||{};
 const total=progress.trainingTotal||4;
 const done=progress.trainingCompleted??(Array.isArray(training.completedLessons)?training.completedLessons.length:0);
 const signed=agreement.signature;
 const signatureMarkup=typeof signed==='string'&&['data:image/png;base64,','data:image/jpeg;base64,','data:image/webp;base64,'].some(prefix=>signed.startsWith(prefix))
  ?'<div class="onboard-detail-row"><dt>Drawn signature</dt><dd><img alt="Employee signature" src="'+esc(signed)+'" style="max-width:100%;max-height:160px;object-fit:contain;background:white;border:1px solid #ddd;border-radius:8px;padding:8px"></dd></div>'
  :'';
 const agreementFields={Acknowledged:agreement.read, 'Signature name':agreement.signatureName, 'Signed at':agreement.agreedAt, 'Agreement track':agreement.track, 'Agreement role':agreement.role};
 const safeLink=typeof r.agreement_url==='string'&&/^https:\/\//i.test(r.agreement_url)?'<p><a href="'+esc(r.agreement_url)+'" target="_blank" rel="noopener noreferrer">View agreement document ↗</a></p>':'';
 const remaining=Object.fromEntries(Object.entries(onboarding).filter(([k])=>!['name','dob','phone','email','address','city','country','region','zip','role','weeklyHours','agreementRead','agreementName','agreementSignature','agreementAt','agreementTrack','agreementRole','paymentMethod','paymentDetail','paymentConsent','complete','step','updatedAt','onboardingVersion','trainingDone'].includes(k)));
 content.innerHTML=
 section('Progress',rowsFor({'Onboarding':isSubmitted?'Completed':progress.status==='not_started'?'Not started':'In progress','Current step':progress.step==null?'Not started':progress.step+1,'Training lessons completed':done+' of '+total,'Onboarding last saved':progress.onboardingUpdatedAt,'Training last saved':progress.trainingUpdatedAt}))+
 section('Employee information',rowsFor(info))+
 section('Hours and work preferences',rowsFor(work))+
 section('Agreement',rowsFor(agreementFields)+signatureMarkup+safeLink)+
 section('Preferred payment',rowsFor(payment))+
 (Object.keys(remaining).length?section('Additional onboarding answers',rowsFor(remaining)):'');
 if(!Object.keys(onboarding).length&&!Object.keys(r).length){
 content.innerHTML='<p class="onboard-muted">This employee has not submitted onboarding information yet.</p>'+section('Training progress',rowsFor({'Completed lessons':done+' of '+total}));
 }
 }catch(err){content.innerHTML='<p role="alert">Could not load onboarding details: '+esc(err.message||String(err))+'</p>';}
}
document.getElementById('onboardingDetailClose').onclick=()=>document.getElementById('onboardingDetailOverlay').hidden=true;
document.getElementById('onboardingDetailOverlay').onclick=e=>{if(e.target===e.currentTarget)e.currentTarget.hidden=true;};
async function load(){if(!client())return;notice.textContent='Loading onboarding records…';try{const data=await api({action:'list'});users=data.users||[];notice.textContent=users.length+' onboarding records';render()}catch(e){notice.textContent='Onboarding administration is not available yet. The secure admin-onboarding function must be deployed. '+(e.message||'');list.innerHTML=''}}async function reset(id){const u=users.find(x=>x.id===id);if(!u)return;const name=u.name||u.email;if(!confirm('Reset onboarding AND training progress for '+name+'? This cannot be undone. The employee account will remain active.'))return;let typed=prompt('Type RESET to confirm resetting '+name);if(typed!=='RESET')return;notice.textContent='Resetting '+name+'…';try{await api({action:'reset',userId:id});await load();notice.textContent='Onboarding reset for '+name+'. Previous answers were saved in history when available.'}catch(e){notice.textContent='Reset failed: '+(e.message||'Unknown error')}}document.getElementById('onboardingSearch').oninput=e=>{q=e.target.value.trim().toLowerCase();render()};document.getElementById('onboardingRefresh').onclick=load;if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});})();