(() => {
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});};
  let state={rows:[],profiles:new Map(),q:'',action:'',table:''};

  const labels={
    team_permissions:'User permissions',
    crm:'Leads',
    callcenter_commissions:'Deals / payouts',
    callcenter_referral_bonuses:'Referral payouts',
    callcenter_phone_numbers:'Phone numbers',
    callcenter_phone_assignments:'Phone assignments',
    callcenter_direct_skills:'Direct skills'
  };

  function filtered(){
    const q=state.q.toLowerCase();
    return state.rows.filter(r=>{
      if(state.action&&r.action!==state.action)return false;
      if(state.table&&r.table_name!==state.table)return false;
      const p=state.profiles.get(String(r.actor_user_id));
      const hay=[p?.display_name,p?.email,r.actor_email,r.table_name,r.action,r.record_id].join(' ').toLowerCase();
      return !q||hay.includes(q);
    });
  }

  function render(){
    const rows=filtered(),list=document.getElementById('adminAuditList');
    const creates=rows.filter(r=>r.action==='INSERT').length,updates=rows.filter(r=>r.action==='UPDATE').length,deletes=rows.filter(r=>r.action==='DELETE').length;
    document.getElementById('adminAuditSummary').innerHTML=
      '<div><strong>'+rows.length+'</strong><span>Events</span></div>'+
      '<div><strong>'+creates+'</strong><span>Created</span></div>'+
      '<div><strong>'+updates+'</strong><span>Updated</span></div>'+
      '<div><strong>'+deletes+'</strong><span>Deleted</span></div>';
    document.getElementById('adminAuditCount').textContent=String(rows.length);
    list.innerHTML=rows.length?rows.map(r=>{
      const p=state.profiles.get(String(r.actor_user_id));
      const actor=p?.display_name||p?.email||r.actor_email||'System / service';
      const icon=r.action==='DELETE'?'trash-2':r.action==='INSERT'?'plus':'pencil';
      return '<button type="button" class="admin-audit-row admin-audit-button" data-audit-id="'+esc(r.id)+'">'+
        '<span class="admin-audit-icon"><i data-lucide="'+icon+'"></i></span>'+
        '<span class="admin-audit-main"><strong>'+esc(actor)+'</strong><small>'+esc(labels[r.table_name]||r.table_name)+' · '+esc(r.action)+'</small><b>'+esc(fmt(r.created_at))+'</b></span>'+
        '<span class="admin-audit-tag">'+esc(r.record_id||'—')+'</span><i data-lucide="chevron-right"></i></button>';
    }).join(''):'<div class="cc-empty">No audit events match.</div>';
    list.querySelectorAll('[data-audit-id]').forEach(b=>b.onclick=()=>openRow(b.dataset.auditId));
    window.lucide?.createIcons();
  }

  function pretty(value){
    try{return JSON.stringify(value??{},null,2);}catch{return String(value??'');}
  }

  function openRow(id){
    const r=state.rows.find(x=>String(x.id)===String(id));if(!r)return;
    const p=state.profiles.get(String(r.actor_user_id)), ov=document.getElementById('adminAuditDrawerOverlay'), dr=document.getElementById('adminAuditDrawer');
    dr.innerHTML='<div class="admin-user-drawer-head"><div><span class="admin-kicker">AUDIT EVENT</span><h2>'+esc(labels[r.table_name]||r.table_name)+'</h2><p>'+esc(fmt(r.created_at))+'</p></div><button id="closeAuditDrawer"><i data-lucide="x"></i></button></div>'+
      '<div class="admin-user-detail-grid"><div><span>Actor</span><strong>'+esc(p?.display_name||p?.email||r.actor_email||'System / service')+'</strong></div><div><span>Action</span><strong>'+esc(r.action)+'</strong></div><div><span>Record ID</span><strong>'+esc(r.record_id||'—')+'</strong></div><div><span>Table</span><strong>'+esc(r.table_name)+'</strong></div></div>'+
      '<div class="admin-audit-json"><h3>Before</h3><pre>'+esc(pretty(r.old_data))+'</pre><h3>After</h3><pre>'+esc(pretty(r.new_data))+'</pre></div>';
    ov.hidden=false;dr.querySelector('#closeAuditDrawer').onclick=()=>ov.hidden=true;ov.onclick=e=>{if(e.target===ov)ov.hidden=true};window.lucide?.createIcons();
  }

  async function load(){
    const c=window.steadyHandsCRMClient;if(!c)return;
    try{
      const [auditR,profilesR]=await Promise.all([
        c.from('callcenter_admin_audit_log').select('id,actor_user_id,actor_email,action,table_name,record_id,old_data,new_data,created_at').order('created_at',{ascending:false}).limit(10000),
        c.from('callcenter_profiles').select('user_id,display_name,email')
      ]);
      if(auditR.error)throw auditR.error;if(profilesR.error)throw profilesR.error;
      state.rows=auditR.data||[];state.profiles=new Map((profilesR.data||[]).map(p=>[String(p.user_id),p]));
      const tables=[...new Set(state.rows.map(r=>r.table_name).filter(Boolean))].sort();
      document.getElementById('adminAuditTable').innerHTML='<option value="">All areas</option>'+tables.map(t=>'<option value="'+esc(t)+'">'+esc(labels[t]||t)+'</option>').join('');
      render();
    }catch(error){
      document.getElementById('adminAuditList').innerHTML='<section class="admin-dashboard-error"><strong>Unable to load audit log.</strong><p>'+esc(error?.message||'Run the Batch 8 SQL, then refresh.')+'</p></section>';
    }
  }

  document.getElementById('adminAuditSearch')?.addEventListener('input',e=>{state.q=e.target.value||'';render();});
  document.getElementById('adminAuditAction')?.addEventListener('change',e=>{state.action=e.target.value||'';render();});
  document.getElementById('adminAuditTable')?.addEventListener('change',e=>{state.table=e.target.value||'';render();});

  if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();