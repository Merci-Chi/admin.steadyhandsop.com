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
    const total=Math.max(0,Math.floor(Number(seconds)||0)), m=Math.floor(total/60), s=total%60;
    return m ? m+'m '+String(s).padStart(2,'0')+'s' : s+'s';
  };

  let state = { rows:[], users:[], leads:new Map(), transcripts:new Map(), q:'', user:'', outcome:'', date:'all', followups:[], followupError:'', fq:'', callsShown:100, followupsShown:100, periodMode:'week', periodOffset:0 };

  function outcomeClass(row) {
    const text=String(row.outcome||'').toLowerCase().replace(/[_-]+/g,' ');
    if (/sale|sold|closed/.test(text)) return 'sale';
    if (/call.?back|follow.?up|requested text|requested email/.test(text)) return 'callback';
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

  function personLabel(id) {
    const user=state.users.find(u=>String(u.user_id)===String(id));
    return user?.display_name||user?.email||String(id||'Unknown associate');
  }

  function selectedPeriod() {
    const now=new Date();
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if(state.periodMode==='month'){
      const start=new Date(today.getFullYear(),today.getMonth()+state.periodOffset,1);
      const end=new Date(start.getFullYear(),start.getMonth()+1,1);
      return {start,end,days:new Date(start.getFullYear(),start.getMonth()+1,0).getDate(),title:start.toLocaleDateString('en-US',{month:'long',year:'numeric'})};
    }
    const start=new Date(today);
    start.setDate(today.getDate()-today.getDay()+state.periodOffset*7);
    const end=new Date(start);
    end.setDate(start.getDate()+7);
    const saturday=new Date(end);
    saturday.setDate(end.getDate()-1);
    return {start,end,days:7,title:'Week Ending '+saturday.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})};
  }

  function renderSummary() {
    const title=state.user ? personLabel(state.user)+"'s Performance" : 'Team Performance';
    document.getElementById('performanceTitle').textContent=title;
    const heading=document.querySelector('.topbar h1');
    if(heading) heading.textContent=title;
    document.title=title+' • Steady Hands Admin';
    const {start:since,end:until,days:dayCount,title:periodTitle}=selectedPeriod();
    const label=document.getElementById('performancePeriodLabel');
    if(label)label.textContent=periodTitle;
    const subtitle=document.getElementById('performancePeriodSubtitle');
    if(subtitle)subtitle.textContent=since.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+new Date(until.getFullYear(),until.getMonth(),until.getDate()-1).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' · Recorded call activity';
    const range=document.getElementById('performanceChartRange');
    if(range)range.textContent=state.periodMode==='week'?'Sunday – Saturday':'Daily activity';
    const nextButton=document.getElementById('performancePeriodNext');
    if(nextButton)nextButton.disabled=state.periodOffset>=0;
    const rows=state.rows.filter(r=>(!state.user||String(r.user_id)===state.user)&&new Date(r.created_at)>=since&&new Date(r.created_at)<until&&!/didn.t call|did not call/i.test(r.outcome||''));
    const positive=rows.filter(r=>/interested|follow.?up|call.?back|requested (text|email)|sale|sold|closed/i.test(r.outcome||'')&&!/not interested/i.test(r.outcome||'')).length;
    const average=rows.length?Math.round(rows.reduce((n,r)=>n+Math.max(0,Number(r.duration_seconds)||0),0)/rows.length):0;
    document.getElementById('adminActivitySummary').innerHTML=[
      ['Calls Logged',rows.length,'Manually logged and app calls'],
      ['Positive Outcomes',positive,'Based on logged outcomes'],
      ['Positive Outcome Rate',(rows.length?Math.round(100*positive/rows.length):0)+'%','Not a verified close rate'],
      ['Avg. Logged Duration',Math.floor(average/60)+'m '+String(average%60).padStart(2,'0')+'s','Based on recorded durations']
    ].map(([label,value,note])=>`<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
    const days=Array.from({length:dayCount},(_,i)=>{
      const day=new Date(since);day.setDate(since.getDate()+i);
      const next=new Date(day);next.setDate(day.getDate()+1);
      return {date:day,label:state.periodMode==='week'?day.toLocaleDateString('en-US',{weekday:'short'}):String(day.getDate()),count:rows.filter(r=>new Date(r.created_at)>=day&&new Date(r.created_at)<next).length};
    });
    const max=Math.max(1,...days.map(d=>d.count));
    const today=new Date();today.setHours(0,0,0,0);
    const chart=document.getElementById('performanceChart');
    chart.classList?.toggle?.('performance-bars-month',state.periodMode==='month');
    chart.style?.setProperty?.('--month-columns',String(dayCount));
    chart.setAttribute('role','img');chart.setAttribute('aria-label','Calls logged by day: '+days.map(d=>d.label+' '+d.count).join(', '));
    chart.innerHTML=days.map(d=>`<div class="performance-bar-cell${d.date.getTime()===today.getTime()?' is-today':''}${d.date>today?' is-future':''}" title="${esc(d.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}: ${d.count} calls"><span>${d.date>today?'—':d.count}</span><div class="performance-bar-track"><div style="height:${d.date>today?0:100*d.count/max}%"></div></div><small>${esc(d.label)}</small></div>`).join('');

  }

  function renderFollowups() {
    const owned=state.followups.filter(r=>!state.user||String(r.callback_owner_id)===state.user);
    const rows=owned.filter(r=>[r.company,r.name,r.phone,personLabel(r.callback_owner_id)].join(' ').toLowerCase().includes(state.fq));
    const shown=rows.slice(0,state.followupsShown);
    document.getElementById('performanceFollowupCount').textContent=shown.length+' of '+rows.length;
    document.getElementById('performanceFollowups').innerHTML=state.followupError?`<p role="alert">Unable to load follow-ups: ${esc(state.followupError)}. Refresh to retry.</p>`:shown.map(lead=>{
      const call=state.rows.find(r=>String(r.id)===String(lead.call?.id))||lead.call;
      return `<article class="performance-followup-card">${renderCallRow(call||{user_id:lead.callback_owner_id,crm_id:lead.id,outcome:'Follow-up'},lead)}${window.PerformanceFollowupActions.buttons(lead)}</article>`;
    }).join('')||'<p class="performance-empty">'+(state.fq?'No follow-ups match your search.':'No follow-ups scheduled.')+'</p>';
    document.getElementById('performanceMoreFollowups').hidden=shown.length>=rows.length||Boolean(state.followupError);
  }

  function renderCallRow(row,followup){
      const user=state.users.find(u=>String(u.user_id)===String(row.user_id));
      const associateLabel=user?.display_name||user?.email||(row.user_id ? `Associate (${String(row.user_id).slice(0,8)})` : followup ? 'Unassigned follow-up' : 'Unknown associate');
      const lead=followup||state.leads.get(String(row.crm_id));
      const transcript=state.transcripts.get(String(row.id));
      const label=lead?.company||lead?.name||lead?.phone||(row.crm_id?'Lead '+String(row.crm_id).slice(0,8):'Unlinked call');
      const oc=outcomeClass(row);
      return `
        <div class="admin-activity-entry" style="display:flex;align-items:stretch;gap:8px;">
        <a class="admin-activity-row" style="flex:1;min-width:0;" ${row.id?`href="call.html?id=${encodeURIComponent(row.id)}"`: 'aria-disabled="true"'}>
          <span class="admin-activity-icon"><i data-lucide="${(Number(row.duration_seconds)||0)>0?'phone-call':'phone-off'}"></i></span>
          <span class="admin-activity-main">
            <strong>${esc(associateLabel)}</strong>
            <b>${esc(label)}</b>
            <small>${row.id?esc(fmtDate(row.created_at))+' · '+esc(fmtDuration(row.duration_seconds)):'No linked call'}${lead?.phone?' · '+esc(lead.phone):''}</small>
            ${followup?`<small>Follow-up: ${esc(followup.follow_up_at?fmtDate(followup.follow_up_at):followup.callbackdate||'Date not set')}${!followup.follow_up_at&&followup.callbackat?' · '+esc(followup.callbackat):''}${followup.follow_up_category?' · '+esc(followup.follow_up_category):''}</small>`:''}
          </span>
          <span class="admin-activity-side">
            <span class="admin-activity-outcome ${oc}">${esc(row.outcome||'No outcome')}</span>
            ${transcript?'<span class="admin-transcript-available"><i data-lucide="file-text"></i>Transcript</span>':''}
          </span>
          ${row.id?'<i data-lucide="chevron-right"></i>':''}
        </a>
        ${row.id?`<button type="button" class="admin-activity-delete" data-delete-call-id="${esc(row.id)}" aria-label="Delete activity for ${esc(label)}" title="Delete call activity" style="align-self:center;flex:none;padding:10px;border:1px solid var(--border-color, #dbe3ed);border-radius:11px;background:transparent;color:#b33b48;cursor:pointer;"><i data-lucide="trash-2"></i></button>`:''}
        </div>`;

  }

  function renderList() {
    const list=document.getElementById('adminActivityList');
    const rows=filtered();
    document.getElementById('adminActivityCount').textContent=Math.min(rows.length,state.callsShown)+' of '+rows.length;
    document.getElementById('performanceMoreCalls').hidden=state.callsShown>=rows.length;
    list.innerHTML=rows.length?rows.slice(0,state.callsShown).map(row=>{
      return renderCallRow(row);
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
      try{state.followups=await window.steadyHandsLoadPerformanceFollowups({client:c,activities:state.rows});state.followupError='';}
      catch(error){state.followupError=error?.message||'Please refresh and try again.';}
      render();
    } catch(error) {
      window.alert('Unable to delete activity: '+(error?.message||'Unknown error')+'\\nIf this is a new feature, run the provided Supabase SQL first.');
      if(button) button.disabled=false;
    }
  }

  function render(){renderSummary();renderFollowups();renderList();}

  for(const id of ['adminActivityList','performanceFollowups'])document.getElementById(id)?.addEventListener('click',event=>{
    const callLink=event.target.closest('a.admin-activity-row[href]');
    if(callLink){
      const callId=new URL(callLink.href,location.href).searchParams.get('id');
      if(callId){
        event.preventDefault();
        const ids=id==='adminActivityList' ? filtered().slice(0,state.callsShown).map(r=>r.id).filter(Boolean) : state.followups.filter(r=>(!state.user||String(r.callback_owner_id)===state.user)&&[r.company,r.name,r.phone,personLabel(r.callback_owner_id)].join(' ').toLowerCase().includes(state.fq)).slice(0,state.followupsShown).map(lead=>lead.call?.id).filter(Boolean);
        window.steadyHandsOpenAdminCall?.({ids,activityId:callId,trigger:callLink});
      }
      return;
    }
    const button=event.target.closest('[data-delete-call-id]');
    if(button) { event.preventDefault(); event.stopPropagation(); void deleteActivity(button.dataset.deleteCallId); }
  });

  async function load() {
    const c=window.steadyHandsCRMClient;
    if(!c) return;
    try {
      // Read every page; Supabase may cap each response even when limit(10000) is requested.
      const readAll=async(table,columns,order='id',configure=q=>q)=>{
        const rows=[];
        for(let offset=0;;){
          const {data,error}=await configure(c.from(table).select(columns)).order(order,{ascending:true}).range(offset,offset+499);
          if(error) throw error;
          if(!data?.length) return rows;
          rows.push(...data);offset+=data.length;
        }
      };
      const callsPromise=readAll('callcenter_call_activity','id,user_id,crm_id,duration_seconds,outcome,created_at');
      // Render primary activity immediately, without waiting for optional requests.
      const calls=await callsPromise;
      state.rows=calls.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      const requestedUser=new URLSearchParams(location.search).get('user')||'';
      state.user=requestedUser;
      render();
      const earlyStatus=document.getElementById('performanceLoadStatus');
      if(earlyStatus){
        earlyStatus.hidden=false;
        earlyStatus.textContent=state.rows.length
          ? 'Loaded '+state.rows.length+' call records. Loading associate details…'
          : 'Supabase returned no call activity records. Check database read access for this administrator.';
      }
      // Secondary lookups cannot block the initial call history.
      const secondary=await Promise.allSettled([
        readAll('callcenter_profiles','user_id,display_name,email','user_id'),
        readAll('callcenter_transcripts','id,call_activity_id'),
        window.steadyHandsLoadPerformanceFollowups({client:c,activities:Promise.resolve(calls)})
      ]);
      const users=secondary[0].status==='fulfilled'?secondary[0].value:[];
      const transcripts=secondary[1].status==='fulfilled'?secondary[1].value:[];
      const followups=secondary[2].status==='fulfilled'?{data:secondary[2].value}:{error:secondary[2].reason};
      const warnings=secondary.map((result,i)=>result.status==='rejected'
        ? ['Associate profiles','Transcripts','Follow-ups'][i]+': '+(result.reason?.message||'unavailable'):null).filter(Boolean);
      state.rows=calls.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      state.users=users;
      // Keep historical associates selectable even if their profile has been removed.
      for(const id of new Set([...calls.map(r=>r.user_id),...(followups.data||[]).map(r=>r.callback_owner_id)].filter(Boolean))) {
        if(!state.users.some(u=>String(u.user_id)===String(id)))state.users.push({user_id:id});
      }
      state.users.sort((a,b)=>personLabel(a.user_id).localeCompare(personLabel(b.user_id)));
      state.followups=followups.data||[];
      state.followupError=followups.error?.message||'';
      state.transcripts.clear();state.leads.clear();
      for(const t of transcripts)if(t.call_activity_id)state.transcripts.set(String(t.call_activity_id),t);

      const crmIds=[...new Set(state.rows.map(r=>r.crm_id).filter(Boolean))];
      for(let i=0;i<crmIds.length;i+=100){
        const ids=crmIds.slice(i,i+100);
        // Only request the fields needed to label calls. Optional CRM columns
        // can vary by schema and must not cause all lead labels to disappear.
        const {data,error}=await c.from('crm')
          .select('id,company,name,phone')
          .in('id',ids);
        if(error){
          warnings.push('CRM lead lookup failed: '+error.message);
          break;
        }
        for(const lead of data||[]) state.leads.set(String(lead.id),lead);
      }
      if(crmIds.length && state.leads.size===0){
        warnings.push('No matching CRM leads were returned for '+crmIds.length+' linked call IDs. Check CRM SELECT permissions or missing lead records.');
      }
      if(!crmIds.length && state.rows.length){
        warnings.push('Call records have no CRM lead IDs, so business names cannot be resolved.');
      }

      const userFilter=document.getElementById('adminActivityUserFilter');
      userFilter.innerHTML='<option value="">Team Performance</option>'+state.users.map(u=>`<option value="${esc(u.user_id)}">${esc(personLabel(u.user_id))}</option>`).join('');
      const requested=new URLSearchParams(location.search).get('user')||'';
      if(requested){
        if(!state.users.some(u=>String(u.user_id)===requested)){state.users.push({user_id:requested});userFilter.innerHTML+=`<option value="${esc(requested)}">${esc(requested)}</option>`;}
        state.user=requested;userFilter.value=requested;
      }

      render();
      const status=document.getElementById('performanceLoadStatus');
      if(status){
        status.hidden=false;
        status.textContent=state.rows.length
          ? 'Loaded '+state.rows.length+' call records'+(warnings.length?'. Some details could not load: '+warnings.join('; '):'.')
          : 'No call records were returned. Check call activity permissions or whether this Supabase project contains call logs.';
      }
    } catch(error) {
      const status=document.getElementById('performanceLoadStatus');
      if(status){status.hidden=false;status.textContent='Unable to read call data: '+(error?.message||'Unknown database error');}
      document.getElementById('adminActivitySummary').innerHTML='<p role="alert">Performance metrics are unavailable. Refresh to retry.</p>';
      document.getElementById('performanceFollowups').innerHTML='<p>Follow-ups unavailable. Refresh to retry.</p>';
      document.getElementById('adminActivityList').innerHTML=`<section class="admin-dashboard-error"><strong>Unable to load performance.</strong><p>${esc(error?.message||'Please refresh and try again.')}</p></section>`;
    }
  }

  document.getElementById('performancePeriodPrev')?.addEventListener('click',()=>{state.periodOffset--;renderSummary();});
  document.getElementById('performancePeriodNext')?.addEventListener('click',()=>{if(state.periodOffset<0){state.periodOffset++;renderSummary();}});
  document.getElementById('performancePeriodToday')?.addEventListener('click',()=>{state.periodOffset=0;renderSummary();});
  document.getElementById('performancePeriodMode')?.addEventListener('change',e=>{state.periodMode=e.target.value==='month'?'month':'week';state.periodOffset=0;renderSummary();});
  document.getElementById('adminActivitySearch')?.addEventListener('input',e=>{state.q=String(e.target.value||'').toLowerCase().trim();state.callsShown=100;render();});
  document.getElementById('adminActivityUserFilter')?.addEventListener('change',e=>{state.user=e.target.value||'';state.callsShown=100;state.followupsShown=100;const url=new URL(location.href);if(state.user)url.searchParams.set('user',state.user);else url.searchParams.delete('user');history.replaceState(null,'',url);render();});
  document.getElementById('adminActivityOutcomeFilter')?.addEventListener('change',e=>{state.outcome=e.target.value||'';state.callsShown=100;render();});
  document.getElementById('adminActivityDateFilter')?.addEventListener('change',e=>{state.date=e.target.value||'all';state.callsShown=100;render();});
  document.getElementById('performanceExportTranscripts')?.addEventListener('click',()=>window.SteadyHandsTranscriptExport?.bulk(state.rows.map(r=>({id:r.id,associate:personLabel(r.user_id),lead:(state.leads.get(String(r.crm_id))?.company||state.leads.get(String(r.crm_id))?.name||'Unknown lead'),date:r.created_at,outcome:r.outcome,duration:r.duration_seconds,created_at:r.created_at})),filtered().map(r=>({id:r.id,associate:personLabel(r.user_id),lead:(state.leads.get(String(r.crm_id))?.company||state.leads.get(String(r.crm_id))?.name||'Unknown lead'),date:r.created_at,outcome:r.outcome,duration:r.duration_seconds,created_at:r.created_at}))));
  document.getElementById('adminActivityRefresh')?.addEventListener('click',()=>location.reload());

  document.getElementById('performanceFollowups')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-followup-action]');if(!button)return;
    const lead=state.followups.find(r=>String(r.id)===button.dataset.followupId&&String(r.callback_owner_id||'')===button.dataset.followupOwner);
    if(lead)window.PerformanceFollowupActions.open({client:window.steadyHandsCRMClient,lead,userId:lead.callback_owner_id,mode:button.dataset.followupAction,admin:true,trigger:button});
  });

  window.addEventListener?.('steadyhands:followup-saved',()=>render());
  document.getElementById('performanceFollowupSearch')?.addEventListener('input',e=>{state.fq=String(e.target.value||'').toLowerCase().trim();state.followupsShown=100;render();});
  document.getElementById('performanceMoreCalls')?.addEventListener('click',()=>{state.callsShown+=100;renderList();});
  document.getElementById('performanceMoreFollowups')?.addEventListener('click',()=>{state.followupsShown+=100;render();});

  if(window.steadyHandsAdminSession) load();
  else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();