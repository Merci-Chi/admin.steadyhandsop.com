(()=>{'use strict';
const notice=document.getElementById('trainingNotice'),container=document.getElementById('trainingRecords'),search=document.getElementById('trainingSearch');
const names=['Welcome to Steady Hands','Client Experience & Portal','Using the Outreach Platform','Commissions & Expectations'];
let users=[],progress=[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&quot;':'&quot;',"'":'&#39;'}[c]));
function formatSeconds(s){s=Number(s)||0;return Math.floor(s/60)+'m '+(s%60)+'s';}
function render(){
 const q=search.value.trim().toLowerCase();
 const matches=users.filter(u=>[u.name,u.email,u.role].some(v=>String(v||'').toLowerCase().includes(q)));
 container.innerHTML=matches.map(u=>{
  const rows=progress.filter(p=>p.user_id===u.id);
  const done=rows.filter(p=>p.completed).length;
  const watched=rows.reduce((n,p)=>n+(p.seconds_watched||0),0);
  const latest=rows.reduce((t,p)=>p.updated_at&&(!t||p.updated_at>t)?p.updated_at:t,null);
  return '<article class="admin-user-card" style="padding:18px;margin-bottom:12px;display:block"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><strong>'+esc(u.name||u.email||'Team member')+'</strong><small style="display:block">'+esc(u.email||'')+' · '+esc(u.role||'')+'</small></div><b>'+done+'/4 · '+(done*25)+'%</b></div><div style="height:8px;border-radius:9px;background:#b9cfe4;margin:14px 0;overflow:hidden"><div style="height:100%;background:#2787e7;width:'+(done*25)+'%"></div></div><p style="margin:0 0 12px;font-size:12px">Playback tracked: '+formatSeconds(watched)+' · Last updated: '+(latest?new Date(latest).toLocaleString():'Not started')+'</p><button type="button" data-toggle="'+esc(u.id)+'" style="border:1px solid #b9cce0;background:transparent;color:inherit;border-radius:8px;padding:8px 12px">View lessons</button><div id="detail-'+esc(u.id)+'" hidden style="padding-top:12px">'+names.map((name,i)=>{const r=rows.find(x=>x.lesson_id===i);return '<div style="border-top:1px solid #a0b2c455;padding:10px 0"><strong>'+esc(name)+'</strong><small style="display:block">'+(r?.completed?'Completed':'Not complete')+' · Watched '+formatSeconds(r?.seconds_watched)+' · Position '+formatSeconds(r?.last_position_seconds)+(r?.duration_seconds?' / '+formatSeconds(r.duration_seconds):'')+'</small></div>';}).join('')+'</div></article>';
 }).join('')||'<div class="cc-empty">No team members found.</div>';
 container.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{const detail=document.getElementById('detail-'+b.dataset.toggle);detail.hidden=!detail.hidden;});
 window.lucide?.createIcons();
}
async function load(){
 const client=window.steadyHandsCRMClient;if(!client)return;
 notice.textContent='Loading training records…';
 try{
  const [staff,records]=await Promise.all([client.functions.invoke('admin-onboarding',{body:{action:'list'}}),client.from('training_progress').select('user_id,lesson_id,completed,seconds_watched,duration_seconds,last_position_seconds,updated_at').order('updated_at',{ascending:false})]);
  if(staff.error)throw staff.error;if(staff.data?.error)throw Error(staff.data.error);
  if(records.error)throw records.error;
  users=(staff.data?.users||[]).map(u=>({...u,id:u.id||u.user_id}));
  progress=records.data||[];
  notice.textContent=users.length+' team members · '+progress.length+' lesson records';render();
 }catch(e){notice.textContent='Training records could not load: '+(e.message||e)+'. Verify the training_progress table, policies and admin-onboarding function.';container.innerHTML='';}
}
search.addEventListener('input',render);
document.getElementById('trainingRefresh').addEventListener('click',load);
if(window.steadyHandsAdminSession)load();
else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();