(() => {
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};
  let state={rows:[],profiles:new Map(),q:'',range:'7'};

  function filtered(){
    const q=state.q.toLowerCase(), days=state.range==='all'?null:Number(state.range)||7, cutoff=days?Date.now()-days*86400000:0;
    return state.rows.filter(r=>{
      if(cutoff&&new Date(r.signed_in_at).getTime()<cutoff)return false;
      const p=state.profiles.get(String(r.user_id));
      const hay=[p?.display_name,p?.email,r.email,r.provider].join(' ').toLowerCase();
      return !q||hay.includes(q);
    });
  }

  function render(){
    const rows=filtered(), list=document.getElementById('adminLoginList');
    const unique=new Set(rows.map(r=>String(r.user_id)).filter(Boolean)).size;
    const todayStart=new Date();todayStart.setHours(0,0,0,0);
    const today=rows.filter(r=>new Date(r.signed_in_at)>=todayStart).length;
    document.getElementById('adminLoginSummary').innerHTML=
      '<div><strong>'+rows.length+'</strong><span>Sign-ins</span></div>'+
      '<div><strong>'+unique+'</strong><span>Unique users</span></div>'+
      '<div><strong>'+today+'</strong><span>Today</span></div>'+
      '<div><strong>'+state.rows.length+'</strong><span>Total logged</span></div>';
    document.getElementById('adminLoginCount').textContent=String(rows.length);

    list.innerHTML=rows.length?rows.map(r=>{
      const p=state.profiles.get(String(r.user_id));
      const name=p?.display_name||p?.email||r.email||'Unknown user';
      return '<div class="admin-audit-row">'+
        '<span class="admin-audit-icon"><i data-lucide="log-in"></i></span>'+
        '<span class="admin-audit-main"><strong>'+esc(name)+'</strong><small>'+esc(r.email||p?.email||'')+'</small><b>'+esc(fmt(r.signed_in_at))+'</b></span>'+
        '<span class="admin-audit-tag">'+esc(r.provider||'password')+'</span>'+
      '</div>';
    }).join(''):'<div class="cc-empty">No login events match this view.</div>';
    window.lucide?.createIcons();
  }

  async function load(){
    const c=window.steadyHandsCRMClient;if(!c)return;
    try{
      const [loginsR,profilesR]=await Promise.all([
        c.from('callcenter_login_activity').select('id,user_id,email,provider,signed_in_at,created_at').order('signed_in_at',{ascending:false}).limit(10000),
        c.from('callcenter_profiles').select('user_id,display_name,email')
      ]);
      if(loginsR.error)throw loginsR.error;if(profilesR.error)throw profilesR.error;
      state.rows=loginsR.data||[];state.profiles=new Map((profilesR.data||[]).map(p=>[String(p.user_id),p]));render();
    }catch(error){
      document.getElementById('adminLoginList').innerHTML='<section class="admin-dashboard-error"><strong>Unable to load login activity.</strong><p>'+esc(error?.message||'Run the Batch 8 SQL, then refresh.')+'</p></section>';
    }
  }

  document.getElementById('adminLoginSearch')?.addEventListener('input',e=>{state.q=e.target.value||'';render();});
  document.getElementById('adminLoginRange')?.addEventListener('change',e=>{state.range=e.target.value||'7';render();});
  document.getElementById('adminLoginRefresh')?.addEventListener('click',()=>location.reload());

  if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();