(() => {
  const esc = value => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  const fmtDate = value => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };
  const fmtDuration = seconds => {
    const total=Math.max(0,Number(seconds)||0), m=Math.floor(total/60), s=total%60;
    return m ? m+'m '+String(s).padStart(2,'0')+'s' : s+'s';
  };

  let state = { rows:[], users:[], leads:new Map(), transcripts:new Map(), q:'', user:'', outcome:'', date:'all' };

  function outcomeClass(row) {
    const text=String(row.outcome||'').toLowerCase();
    if (/sale|sold|closed/.test(text)) return 'sale';
    if (/call back|callback|follow up|requested text|requested email/.test(text)) return 'callback';
    if (/not interested/.test(text)) return 'notinterested';
    if (/didn.t call/.test(text)) return 'didntcall';
    if (/no answer|voicemail|didn.t answer/.test(text)) return 'noanswer';
    if ((Number(row.duration_seconds)||0)>0) return 'connected';
    return 'other';
  }

  function filtered() {
    const now=new Date();
    return state.rows.filter(row=>{
      if (state.user && String(row.user_id)!==state.user) return false;
      if (state.outcome && outcomeClass(row)!==state.outcome) return false;
      if (state.date!=='all') {
        const d=new Date(row.created_at);
        if (state.date==='today') {
          const start=new Date(); start.setHours(0,0,0,0);
          if (d<start) return false;
        } else {
          const days=Number(state.date)||0;
          const start=new Date(now.getTime()-days*86400000);
          if (d<start) return false;
        }
      }
      if (!state.q) return true;
      const lead=state.leads.get(String(row.crm_id));
      const user=state.users.find(u=>String(u.user_id)===String(row.user_id));
      const hay=[user?.display_name,user?.email,lead?.company,lead?.name,lead?.phone,row.outcome].join(' ').toLowerCase();
      return hay.includes(state.q);
    });
  }

  function renderSummary() {
    const rows=filtered();
    const connected=rows.filter(r=>(Number(r.duration_seconds)||0)>0).length;
    const callbacks=rows.filter(r=>outcomeClass(r)==='callback').length;
    const transcripts=rows.filter(r=>state.transcripts.has(String(r.id))).length;
    document.getElementById('adminActivitySummary').innerHTML=`
      <div><strong>${rows.length}</strong><span>Calls</span></div>
      <div><strong>${connected}</strong><span>Connected</span></div>
      <div><strong>${callbacks}</strong><span>Callbacks</span></div>
      <div><strong>${transcripts}</strong><span>Transcripts</span></div>`;
    document.getElementById('adminActivityCount').textContent=String(rows.length);
  }

  function renderList() {
    const list=document.getElementById('adminActivityList');
    const rows=filtered();
    list.innerHTML=rows.length?rows.map(row=>{
      const user=state.users.find(u=>String(u.user_id)===String(row.user_id));
      const lead=state.leads.get(String(row.crm_id));
      const transcript=state.transcripts.get(String(row.id));
      const label=lead?.company||lead?.name||lead?.phone||'Unknown lead';
      const oc=outcomeClass(row);
      return `
        <div class="admin-activity-entry" style="display:flex;align-items:stretch;gap:8px;">
        <a class="admin-activity-row" style="flex:1;min-width:0;" href="call.html?id=${encodeURIComponent(row.id)}">
          <span class="admin-activity-icon"><i data-lucide="${(Number(row.duration_seconds)||0)>0?'phone-call':'phone-off'}"></i></span>
          <span class="admin-activity-main">
            <strong>${esc(user?.display_name||user?.email||'Unknown user')}</strong>
            <b>${esc(label)}</b>
            <small>${esc(fmtDate(row.created_at))} · ${esc(fmtDuration(row.duration_seconds))}</small>
          </span>
          <span class="admin-activity-side">
            <span class="admin-activity-outcome ${oc}">${esc(row.outcome||'No outcome')}</span>
            ${transcript?'<span class="admin-transcript-available"><i data-lucide="file-text"></i>Transcript</span>':''}
          </span>
          <i data-lucide="chevron-right"></i>
        </a>
        <button type="button" class="admin-activity-delete" data-delete-call-id="${esc(row.id)}" aria-label="Delete activity for ${esc(label)}" title="Delete activity" style="align-self:center;flex:none;padding:10px;border:1px solid var(--border-color, #dbe3ed);border-radius:11px;background:transparent;color:#b33b48;cursor:pointer;"><i data-lucide="trash-2"></i></button>
        </div>`;
    }).join(''):'<div class="cc-empty">No calls match these filters.</div>';
    window.lucide?.createIcons();
  }

  async function deleteActivity(id) {
    const row=state.rows.find(item=>String(item.id)===String(id));
    if(!row) return;
    const lead=state.leads.get(String(row.crm_id));
    const label=lead?.company||lead?.name||lead?.phone||'Unknown lead';
    if(!window.confirm(`Delete this call activity for "${label}" from ${fmtDate(row.created_at)}? This also deletes its linked transcript and cannot be undone. The CRM lead will not be deleted.`)) return;
    const c=window.steadyHandsCRMClient;
    if(!c) return window.alert('Unable to connect to CRM.');
    const button=[...document.querySelectorAll('[data-delete-call-id]')].find(el=>el.dataset.deleteCallId===String(id));
    if(button) button.disabled=true;
    try {
      const {data,error}=await c.rpc('admin_delete_call_activity',{p_activity_id:id});
      if(error) throw error;
      if(data!==true) throw new Error('Activity was not found or could not be deleted.');
      state.rows=state.rows.filter(item=>String(item.id)!==String(id));
      state.transcripts.delete(String(id));
      render();
    } catch(error) {
      window.alert('Unable to delete activity: '+(error?.message||'Unknown error')+'\\nIf this is a new feature, run the provided Supabase SQL first.');
      if(button) button.disabled=false;
    }
  }

  function render(){renderSummary();renderList();}

  document.getElementById('adminActivityList')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-delete-call-id]');
    if(button) { event.preventDefault(); event.stopPropagation(); void deleteActivity(button.dataset.deleteCallId); }
  });

  async function load() {
    const c=window.steadyHandsCRMClient;
    if(!c) return;
    try {
      const [callsR,usersR,transcriptsR]=await Promise.all([
        c.from('callcenter_call_activity')
          .select('id,user_id,crm_id,duration_seconds,outcome,created_at')
          .order('created_at',{ascending:false})
          .limit(10000),
        c.from('callcenter_profiles')
          .select('user_id,display_name,email')
          .order('display_name',{ascending:true}),
        c.from('callcenter_transcripts')
          .select('id,call_activity_id,transcript,segments,started_at,ended_at,outcome,created_at')
          .order('created_at',{ascending:false})
          .limit(10000)
      ]);
      const err=[callsR.error,usersR.error,transcriptsR.error].find(Boolean);
      if(err) throw err;

      state.rows=callsR.data||[];
      state.users=usersR.data||[];
      for(const t of transcriptsR.data||[]) {
        if(t.call_activity_id && !state.transcripts.has(String(t.call_activity_id))) state.transcripts.set(String(t.call_activity_id),t);
      }

      const crmIds=[...new Set(state.rows.map(r=>r.crm_id).filter(Boolean))];
      for(let i=0;i<crmIds.length;i+=500){
        const {data,error}=await c.from('crm')
          .select('id,company,name,phone,timezone,stage,outcome')
          .in('id',crmIds.slice(i,i+500));
        if(error) throw error;
        for(const lead of data||[]) state.leads.set(String(lead.id),lead);
      }

      const userFilter=document.getElementById('adminActivityUserFilter');
      userFilter.innerHTML='<option value="">All users</option>'+state.users.map(u=>`<option value="${esc(u.user_id)}">${esc(u.display_name||u.email||'User')}</option>`).join('');
      const requested=new URLSearchParams(location.search).get('user')||'';
      if(requested){state.user=requested;userFilter.value=requested;}

      render();
    } catch(error) {
      document.getElementById('adminActivityList').innerHTML=`<section class="admin-dashboard-error"><strong>Unable to load activity.</strong><p>${esc(error?.message||'Please refresh and try again.')}</p></section>`;
    }
  }

  document.getElementById('adminActivitySearch')?.addEventListener('input',e=>{state.q=String(e.target.value||'').toLowerCase();render();});
  document.getElementById('adminActivityUserFilter')?.addEventListener('change',e=>{state.user=e.target.value||'';render();});
  document.getElementById('adminActivityOutcomeFilter')?.addEventListener('change',e=>{state.outcome=e.target.value||'';render();});
  document.getElementById('adminActivityDateFilter')?.addEventListener('change',e=>{state.date=e.target.value||'all';render();});
  document.getElementById('adminActivityRefresh')?.addEventListener('click',()=>location.reload());

  if(window.steadyHandsAdminSession) load();
  else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();