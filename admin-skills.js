(() => {
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
  const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});};
  let state={users:[],feedback:[],assignments:[],q:'',range:'7'};

  function rangeFiltered(rows){
    if(state.range==='all') return rows;
    const days=Number(state.range)||7, cutoff=Date.now()-days*86400000;
    return rows.filter(r=>new Date(r.created_at||r.updated_at||0).getTime()>=cutoff);
  }

  function userStats(userId){
    const rows=rangeFiltered(state.feedback.filter(r=>String(r.user_id)===String(userId)));
    const keys=['opening','questions','pricing','objection_handling','closing'];
    const vals=[];
    for(const row of rows){
      const scores=row.scores&&typeof row.scores==='object'?row.scores:{};
      for(const key of keys){if(Number.isFinite(Number(scores[key]))) vals.push(clamp(scores[key]));}
    }
    const avg=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
    const byKey={};
    for(const key of keys){
      const k=rows.map(r=>clamp(r.scores?.[key])).filter(v=>v>0);
      byKey[key]=k.length?Math.round(k.reduce((a,b)=>a+b,0)/k.length):0;
    }
    return {calls:rows.length,avg,byKey};
  }

  function renderSummary(){
    const feedback=rangeFiltered(state.feedback);
    const allScores=[];
    feedback.forEach(r=>Object.values(r.scores||{}).forEach(v=>{const n=Number(v);if(Number.isFinite(n))allScores.push(clamp(n));}));
    const avg=allScores.length?Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length):0;
    const completed=state.assignments.filter(a=>a.status==='complete').length;
    document.getElementById('adminSkillsSummary').innerHTML=
      '<div><strong>'+feedback.length+'</strong><span>Calls reviewed</span></div>'+
      '<div><strong>'+avg+'</strong><span>Team average</span></div>'+
      '<div><strong>'+state.assignments.length+'</strong><span>Assignments</span></div>'+
      '<div><strong>'+completed+'</strong><span>Completed</span></div>';
  }

  function renderTeam(){
    const list=document.getElementById('adminSkillTeamList');
    const q=state.q.toLowerCase();
    const rows=state.users.filter(u=>!q||[u.display_name,u.email].some(v=>String(v||'').toLowerCase().includes(q)));
    list.innerHTML=rows.length?rows.map(u=>{
      const s=userStats(u.user_id);
      return '<button type="button" class="admin-skill-user-card" data-user-id="'+esc(u.user_id)+'">'+
        '<span class="admin-user-avatar">'+esc((u.display_name||u.email||'U').slice(0,1).toUpperCase())+'</span>'+
        '<span class="admin-skill-user-main"><strong>'+esc(u.display_name||u.email||'Unnamed user')+'</strong><small>'+esc(u.email||'')+'</small>'+
        '<span class="admin-skill-mini"><b>'+s.calls+' reviewed</b><b>Avg '+s.avg+'</b><b>Opening '+s.byKey.opening+'</b><b>Closing '+s.byKey.closing+'</b></span></span>'+
        '<span class="admin-skill-score-badge">'+s.avg+'</span><i data-lucide="chevron-right"></i></button>';
    }).join(''):'<div class="cc-empty">No users match.</div>';
    list.querySelectorAll('[data-user-id]').forEach(b=>b.onclick=()=>openUser(b.dataset.userId));
    window.lucide?.createIcons();
  }

  function renderAssignments(){
    const list=document.getElementById('adminDirectSkillsList');
    document.getElementById('adminDirectSkillCount').textContent=String(state.assignments.length);
    const byUser=new Map(state.users.map(u=>[String(u.user_id),u]));
    list.innerHTML=state.assignments.length?state.assignments.map(a=>{
      const u=byUser.get(String(a.user_id));
      return '<div class="admin-direct-skill-row">'+
        '<span class="admin-direct-skill-icon"><i data-lucide="target"></i></span>'+
        '<span class="admin-direct-skill-main"><strong>'+esc(a.title||a.skill_key||'Skill')+'</strong><small>'+esc(u?.display_name||u?.email||'Unknown user')+' · '+esc(a.priority||'normal')+' priority'+(a.due_at?' · due '+esc(fmtDate(a.due_at)):'')+'</small>'+
        (a.admin_note?'<p>'+esc(a.admin_note)+'</p>':'')+'</span>'+
        '<span class="admin-direct-status '+esc(a.status||'assigned')+'">'+esc(a.status||'assigned')+'</span>'+
        '<button type="button" class="admin-direct-menu" data-assignment-id="'+esc(a.id)+'"><i data-lucide="ellipsis"></i></button></div>';
    }).join(''):'<div class="cc-empty">No direct skills assigned yet.</div>';
    list.querySelectorAll('[data-assignment-id]').forEach(b=>b.onclick=()=>openAssignment(b.dataset.assignmentId));
    window.lucide?.createIcons();
  }

  function scoreBar(label,value){
    return '<div class="admin-skill-score-row"><div><span>'+esc(label)+'</span><strong>'+value+'</strong></div><div class="admin-skill-track"><span style="width:'+value+'%"></span></div></div>';
  }

  function openUser(userId){
    const u=state.users.find(x=>String(x.user_id)===String(userId)); if(!u)return;
    const s=userStats(userId), overlay=document.getElementById('adminSkillDrawerOverlay'), dr=document.getElementById('adminSkillDrawer');
    const rows=rangeFiltered(state.feedback.filter(r=>String(r.user_id)===String(userId))).slice(0,10);
    dr.innerHTML='<div class="admin-user-drawer-head"><div><span class="admin-kicker">TEAM MEMBER</span><h2>'+esc(u.display_name||u.email||'User')+'</h2><p>'+esc(u.email||'')+'</p></div><button id="closeSkillDrawer"><i data-lucide="x"></i></button></div>'+
      '<div class="admin-skill-profile-grid"><div><span>Calls reviewed</span><strong>'+s.calls+'</strong></div><div><span>Average score</span><strong>'+s.avg+'</strong></div></div>'+
      '<section class="admin-skill-score-panel">'+scoreBar('Opening',s.byKey.opening)+scoreBar('Questions',s.byKey.questions)+scoreBar('Pricing',s.byKey.pricing)+scoreBar('Objection Handling',s.byKey.objection_handling)+scoreBar('Closing',s.byKey.closing)+'</section>'+
      '<button class="admin-assign-user-skill" id="assignSkillToUser"><i data-lucide="target"></i>Assign Direct Skill</button>'+
      '<div class="admin-dashboard-head"><div><span class="admin-kicker">RECENT COACHING</span><h2>Call Feedback</h2></div></div>'+
      '<div class="admin-user-feedback-list">'+(rows.length?rows.map(r=>'<div><strong>'+esc(r.summary||'Coaching analysis')+'</strong><small>'+esc(r.sentiment||'neutral')+' · '+esc(fmtDate(r.created_at))+'</small></div>').join(''):'<div class="cc-empty">No analyzed calls in this period.</div>')+'</div>';
    overlay.hidden=false;
    const close=()=>overlay.hidden=true;
    dr.querySelector('#closeSkillDrawer').onclick=close; overlay.onclick=e=>{if(e.target===overlay)close();};
    dr.querySelector('#assignSkillToUser').onclick=()=>openAssign(userId);
    window.lucide?.createIcons();
  }

  function openAssign(prefillUser=''){
    const overlay=document.getElementById('adminSkillDrawerOverlay'), dr=document.getElementById('adminSkillDrawer');
    dr.innerHTML='<div class="admin-user-drawer-head"><div><span class="admin-kicker">DIRECT SKILL</span><h2>Assign Coaching</h2><p>Create a targeted skill assignment.</p></div><button id="closeSkillDrawer"><i data-lucide="x"></i></button></div>'+
      '<div class="admin-lead-form-grid">'+
      '<label class="full">Team member<select id="directSkillUser"><option value="">Choose user</option>'+state.users.map(u=>'<option value="'+esc(u.user_id)+'">'+esc(u.display_name||u.email||'User')+'</option>').join('')+'</select></label>'+
      '<label>Skill<select id="directSkillKey"><option value="opening">Opening</option><option value="questions">Discovery / Questions</option><option value="pricing">Pricing</option><option value="objection_handling">Objection Handling</option><option value="closing">Closing</option><option value="follow_up">Follow-Up</option><option value="confidence">Confidence</option><option value="custom">Custom</option></select></label>'+
      '<label>Priority<select id="directSkillPriority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>'+
      '<label class="full">Title<input id="directSkillTitle" placeholder="Example: Improve objection handling"></label>'+
      '<label>Due date<input id="directSkillDue" type="date"></label>'+
      '<label class="full">Admin note<textarea id="directSkillNote" placeholder="What should they focus on?"></textarea></label>'+
      '</div><div class="admin-lead-actions"><button class="primary" id="saveDirectSkill"><i data-lucide="plus"></i>Assign Skill</button></div><p id="directSkillMessage" class="admin-user-action-message"></p>';
    overlay.hidden=false;
    dr.querySelector('#closeSkillDrawer').onclick=()=>overlay.hidden=true;
    if(prefillUser) dr.querySelector('#directSkillUser').value=prefillUser;
    dr.querySelector('#saveDirectSkill').onclick=async()=>{
      const c=window.steadyHandsCRMClient,msg=dr.querySelector('#directSkillMessage');
      const userId=dr.querySelector('#directSkillUser').value;
      if(!userId){msg.textContent='Choose a team member.';return;}
      const skillKey=dr.querySelector('#directSkillKey').value;
      const title=dr.querySelector('#directSkillTitle').value.trim()||skillKey.replace(/_/g,' ');
      const due=dr.querySelector('#directSkillDue').value;
      const adminId=window.steadyHandsAdminSession?.user?.id||null;
      const payload={user_id:userId,assigned_by_user_id:adminId,skill_key:skillKey,title,priority:dr.querySelector('#directSkillPriority').value,admin_note:dr.querySelector('#directSkillNote').value.trim(),due_at:due?new Date(due+'T23:59:59').toISOString():null,status:'assigned'};
      msg.textContent='Assigning…';
      const {data,error}=await c.from('callcenter_direct_skills').insert(payload).select('*').single();
      if(error){msg.textContent=error.message;return;}
      state.assignments.unshift(data); msg.textContent='Direct skill assigned.'; renderAssignments(); renderSummary();
    };
    window.lucide?.createIcons();
  }

  function openAssignment(id){
    const a=state.assignments.find(x=>String(x.id)===String(id)); if(!a)return;
    const u=state.users.find(x=>String(x.user_id)===String(a.user_id));
    const overlay=document.getElementById('adminSkillDrawerOverlay'),dr=document.getElementById('adminSkillDrawer');
    dr.innerHTML='<div class="admin-user-drawer-head"><div><span class="admin-kicker">DIRECT SKILL</span><h2>'+esc(a.title||'Skill')+'</h2><p>'+esc(u?.display_name||u?.email||'Unknown user')+'</p></div><button id="closeSkillDrawer"><i data-lucide="x"></i></button></div>'+
      '<div class="admin-user-detail-grid"><div><span>Skill</span><strong>'+esc(a.skill_key||'custom')+'</strong></div><div><span>Priority</span><strong>'+esc(a.priority||'normal')+'</strong></div><div><span>Status</span><strong>'+esc(a.status||'assigned')+'</strong></div><div><span>Due</span><strong>'+esc(fmtDate(a.due_at))+'</strong></div></div>'+
      '<div class="admin-call-notes">'+esc(a.admin_note||'No admin note.')+'</div>'+
      '<div class="admin-user-admin-actions"><button id="markSkillComplete"><i data-lucide="circle-check"></i>Mark Complete</button><button class="disable" id="deleteDirectSkill"><i data-lucide="trash-2"></i>Delete</button></div><p id="directSkillMessage" class="admin-user-action-message"></p>';
    overlay.hidden=false;dr.querySelector('#closeSkillDrawer').onclick=()=>overlay.hidden=true;
    dr.querySelector('#markSkillComplete').onclick=async()=>{const {data,error}=await window.steadyHandsCRMClient.from('callcenter_direct_skills').update({status:'complete',completed_at:new Date().toISOString()}).eq('id',a.id).select('*').single();const m=dr.querySelector('#directSkillMessage');if(error){m.textContent=error.message;return;}Object.assign(a,data);m.textContent='Marked complete.';renderAssignments();renderSummary();};
    dr.querySelector('#deleteDirectSkill').onclick=async()=>{if(!confirm('Delete this direct skill assignment?'))return;const {error}=await window.steadyHandsCRMClient.from('callcenter_direct_skills').delete().eq('id',a.id);const m=dr.querySelector('#directSkillMessage');if(error){m.textContent=error.message;return;}state.assignments=state.assignments.filter(x=>String(x.id)!==String(a.id));overlay.hidden=true;renderAssignments();renderSummary();};
    window.lucide?.createIcons();
  }

  async function load(){
    const c=window.steadyHandsCRMClient;if(!c)return;
    try{
      const [usersR,feedbackR,assignR]=await Promise.all([
        c.from('callcenter_profiles').select('user_id,display_name,email').order('display_name',{ascending:true}),
        c.from('callcenter_call_feedback').select('id,user_id,transcript_id,summary,strengths,improvements,sentiment,scores,created_at,updated_at').order('created_at',{ascending:false}).limit(10000),
        c.from('callcenter_direct_skills').select('*').order('created_at',{ascending:false}).limit(5000)
      ]);
      const err=[usersR.error,feedbackR.error,assignR.error].find(Boolean);if(err)throw err;
      state.users=usersR.data||[];state.feedback=feedbackR.data||[];state.assignments=assignR.data||[];
      const requested=new URLSearchParams(location.search).get('user');
      renderSummary();renderTeam();renderAssignments();if(requested)setTimeout(()=>openUser(requested),0);
    }catch(error){
      document.getElementById('adminSkillTeamList').innerHTML='<section class="admin-dashboard-error"><strong>Unable to load skills.</strong><p>'+esc(error?.message||'Please refresh and try again.')+'</p></section>';
      document.getElementById('adminDirectSkillsList').innerHTML='';
    }
  }

  document.getElementById('adminSkillsSearch')?.addEventListener('input',e=>{state.q=e.target.value||'';renderTeam();});
  document.getElementById('adminSkillsRange')?.addEventListener('change',e=>{state.range=e.target.value||'7';renderSummary();renderTeam();});
  document.getElementById('adminAssignSkill')?.addEventListener('click',()=>openAssign());

  if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();