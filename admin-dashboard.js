(()=>{
const e=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const f=d=>d?new Date(d).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Never';
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 const grid=document.getElementById('adminMetricGrid'),usersEl=document.getElementById('adminRecentUsers'),callsEl=document.getElementById('adminRecentCalls'),att=document.getElementById('adminAttention');
 try{
  const r=await Promise.all([
   c.from('callcenter_profiles').select('user_id,display_name,email,last_call_at,created_at,disabled_at'),
   c.from('team_permissions').select('user_id,role,active'),
   c.from('callcenter_call_activity').select('id,user_id,crm_id,duration_seconds,outcome,created_at').order('created_at',{ascending:false}).limit(5000),
   c.from('crm').select('id,name,company,phone',{count:'exact'}),
   c.from('callcenter_commissions').select('user_id,status,commission_amount_cents').limit(5000),
   c.from('callcenter_phone_numbers').select('id,twilio_status,active').limit(5000)
  ]);
  const err=r.find(x=>x.error)?.error;if(err)throw err;
  const profiles=r[0].data||[], perms=r[1].data||[], calls=r[2].data||[], leads=r[3].data||[], comm=r[4].data||[], phones=r[5].data||[];
  const pmap=new Map(perms.map(x=>[String(x.user_id),x]));
  const profmap=new Map(profiles.map(x=>[String(x.user_id),x]));
  const leadmap=new Map(leads.map(x=>[String(x.id),x]));
  const today=new Date();today.setHours(0,0,0,0);
  const week=new Date(today);week.setDate(week.getDate()-((week.getDay()+6)%7));
  const todayCalls=calls.filter(x=>new Date(x.created_at)>=today), weekCalls=calls.filter(x=>new Date(x.created_at)>=week);
  const active=profiles.filter(x=>!x.disabled_at&&pmap.get(String(x.user_id))?.active!==false).length;
  const pending=comm.filter(x=>['pending','waiting_client_payment'].includes(String(x.status||''))).reduce((n,x)=>n+(Number(x.commission_amount_cents)||0),0);
  const pendingPhones=phones.filter(x=>x.twilio_status!=='ready').length;
  const card=(i,l,v,n)=>'<article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="'+i+'"></i></span><strong>'+e(v)+'</strong><b>'+e(l)+'</b><small>'+e(n||'')+'</small></article>';
  grid.innerHTML=[card('users','Active users',active,profiles.length+' total'),card('phone-call','Calls today',todayCalls.length,todayCalls.filter(x=>(Number(x.duration_seconds)||0)>0).length+' connected'),card('calendar-days','Calls this week',weekCalls.length,'Monday through today'),card('contact','Leads',r[3].count??leads.length,'CRM records'),card('circle-dollar-sign','Pending payouts','$'+(pending/100).toFixed(2),'Commission pipeline'),card('phone-forwarded','Pending numbers',pendingPhones,'Need admin setup')].join('');
  usersEl.innerHTML=profiles.slice().sort((a,b)=>new Date(b.last_call_at||b.created_at)-new Date(a.last_call_at||a.created_at)).slice(0,5).map(x=>{const p=pmap.get(String(x.user_id))||{};const dis=!!x.disabled_at||p.active===false;return '<a class="admin-dash-row" href="admin.html?user='+encodeURIComponent(x.user_id)+'"><span class="admin-dash-avatar">'+e((x.display_name||x.email||'U').slice(0,1).toUpperCase())+'</span><span class="admin-dash-main"><strong>'+e(x.display_name||x.email||'Unnamed user')+'</strong><small>'+e(x.email||'')+' · Last call '+e(f(x.last_call_at))+'</small></span><span class="admin-dash-status '+(dis?'disabled':'active')+'">'+(dis?'Disabled':e(p.role||'USER'))+'</span></a>';}).join('')||'<div class="cc-empty">No users found.</div>';
  callsEl.innerHTML=calls.slice(0,7).map(x=>{const p=profmap.get(String(x.user_id));const l=leadmap.get(String(x.crm_id));const name=l?.company||l?.name||l?.phone||'Unknown lead';return '<a class="admin-dash-row" href="activity.html?user='+encodeURIComponent(x.user_id||'')+'"><span class="admin-dash-icon"><i data-lucide="phone-call"></i></span><span class="admin-dash-main"><strong>'+e(p?.display_name||p?.email||'Unknown user')+' → '+e(name)+'</strong><small>'+e(f(x.created_at))+'</small></span><span class="admin-dash-outcome">'+e(x.outcome||'No outcome')+'</span></a>';}).join('')||'<div class="cc-empty">No calls yet.</div>';
  const disabled=profiles.filter(x=>!!x.disabled_at||pmap.get(String(x.user_id))?.active===false).length;const nocalls=profiles.filter(x=>!x.last_call_at).length;
  att.innerHTML='<a class="admin-attention-card" href="account.html"><span><i data-lucide="phone-forwarded"></i></span><strong>'+pendingPhones+'</strong><b>Pending phone numbers</b><small>Waiting for administrator setup</small></a><a class="admin-attention-card" href="admin.html?filter=disabled"><span><i data-lucide="user-x"></i></span><strong>'+disabled+'</strong><b>Disabled accounts</b><small>Review user access</small></a><a class="admin-attention-card" href="admin.html"><span><i data-lucide="phone-off"></i></span><strong>'+nocalls+'</strong><b>Users with no calls</b><small>No completed calls yet</small></a>';
  document.querySelector('.admin-overview-hero h2').textContent='Your operation at a glance';window.lucide?.createIcons();
 }catch(err){console.error(err);grid.innerHTML='<section class="admin-dashboard-error"><strong>Unable to load overview.</strong><p>'+e(err.message||'Please refresh and try again.')+'</p><button onclick="location.reload()">Retry</button></section>';}
}
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();