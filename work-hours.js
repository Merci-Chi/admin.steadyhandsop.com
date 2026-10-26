(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtMin=n=>Math.floor(n/60)+'h '+String(Math.floor(n%60)).padStart(2,'0')+'m';
  const time=ms=>new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  const dayLabel=ms=>new Date(ms).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  const state={calls:[],users:[],loading:false};

  function compute(calls,thresholdMinutes) {
    const groups=new Map();
    for(const r of calls) {
      if(!r.user_id||/didn.t call|did not call/i.test(r.outcome||''))continue;
      const start=Date.parse(r.connected_at||r.created_at||'');
      if(!Number.isFinite(start))continue;
      const providedEnd=Date.parse(r.ended_at||'');
      const duration=Math.max(0,Number(r.duration_seconds)||0)*1000;
      const end=Number.isFinite(providedEnd)&&providedEnd>=start?providedEnd:start+duration;
      const date=new Date(start),key=String(r.user_id)+'|'+date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();
      if(!groups.has(key))groups.set(key,{user:String(r.user_id),day:date,start,end,intervals:[],calls:0});
      const group=groups.get(key);group.start=Math.min(group.start,start);group.end=Math.max(group.end,end);
      group.intervals.push([start,end]);group.calls++;
    }
    return [...groups.values()].map(g=>{
      const intervals=g.intervals.sort((a,b)=>a[0]-b[0]);
      let lastEnd=intervals[0][1],excluded=0;
      for(let i=1;i<intervals.length;i++){
        const gap=Math.max(0,intervals[i][0]-lastEnd);
        if(gap>thresholdMinutes*60000)excluded+=gap;
        lastEnd=Math.max(lastEnd,intervals[i][1]);
      }
      g.span=Math.max(0,g.end-g.start)/60000;g.excluded=excluded/60000;
      g.active=Math.max(0,g.span-g.excluded);
      return g;
    }).sort((a,b)=>b.start-a.start||a.user.localeCompare(b.user));
  }

  function render(){
    const user=$('hoursUser').value,days=Number($('hoursPeriod').value),threshold=Number($('hoursGap').value);
    const from=new Date();from.setHours(0,0,0,0);from.setDate(from.getDate()-(days-1));
    const tomorrow=new Date();tomorrow.setHours(24,0,0,0);
    const data=compute(state.calls.filter(r=>(!user||String(r.user_id)===user)),threshold)
      .filter(g=>g.start>=from.getTime()&&g.start<tomorrow.getTime());
    const sum=key=>data.reduce((n,g)=>n+g[key],0);
    const cards=[['Work span',fmtMin(sum('span'))],['Estimated active',fmtMin(sum('active'))],['Excluded gaps',fmtMin(sum('excluded'))],['Calls logged',String(sum('calls'))]];
    $('hoursMetrics').innerHTML=cards.map(([title,value])=>'<div class="work-hours-metric"><span>'+title+'</span><strong>'+value+'</strong></div>').join('');
    const names=new Map(state.users.map(u=>[String(u.user_id),u.display_name||u.email||String(u.user_id)]));
    $('hoursRows').innerHTML=data.length?data.map(g=>'<tr><td>'+esc(names.get(g.user)||g.user)+'</td><td>'+esc(dayLabel(g.start))+'</td><td>'+esc(time(g.start))+'</td><td>'+esc(time(g.end))+'</td><td>'+g.calls+'</td><td>'+fmtMin(g.span)+'</td><td>'+fmtMin(g.excluded)+'</td><td><strong>'+fmtMin(g.active)+'</strong></td></tr>').join(''):'<tr><td colspan="8">No qualifying call records for this period.</td></tr>';
  }
  async function readAll(client,table,columns,order){
    const rows=[];for(let offset=0;;offset+=500){
      const {data,error}=await client.from(table).select(columns).order(order,{ascending:true}).range(offset,offset+499);
      if(error)throw error;if(!data?.length)return rows;rows.push(...data);
    }
  }
  async function load(){
    if(state.loading||!window.steadyHandsAdminSession||!window.steadyHandsCRMClient)return;
    state.loading=true;$('hoursMetrics').textContent='Loading call records…';
    try{
      const client=window.steadyHandsCRMClient;
      // Existing admin RLS permissions govern both reads; no privileged key or new table.
      const [calls,users]=await Promise.all([
        readAll(client,'callcenter_call_activity','id,user_id,created_at,connected_at,ended_at,duration_seconds,outcome','id'),
        readAll(client,'callcenter_profiles','user_id,display_name,email','user_id')
      ]);
      state.calls=calls;state.users=users;
      const previous=$('hoursUser').value,ids=[...new Set([...users.map(u=>String(u.user_id)),...calls.map(c=>String(c.user_id||'')).filter(Boolean)])];
      const names=new Map(users.map(u=>[String(u.user_id),u.display_name||u.email||String(u.user_id)]));
      ids.sort((a,b)=>(names.get(a)||a).localeCompare(names.get(b)||b));
      $('hoursUser').innerHTML='<option value="">All associates</option>'+ids.map(id=>'<option value="'+esc(id)+'">'+esc(names.get(id)||id)+'</option>').join('');
      const requested=new URLSearchParams(location.search).get('user')||previous;
      $('hoursUser').value=ids.includes(requested)?requested:'';
      render();
    }catch(error){
      $('hoursMetrics').innerHTML='<p role="alert">Unable to load work hours: '+esc(error?.message||'Please try again.')+'</p>';
      $('hoursRows').innerHTML='<tr><td colspan="8">Data unavailable; no zero-hours assumption was made.</td></tr>';
    }finally{state.loading=false;}
  }
  ['hoursUser','hoursPeriod','hoursGap'].forEach(id=>$(id).addEventListener('change',()=>{
    if(id==='hoursUser'){const url=new URL(location.href);if($('hoursUser').value)url.searchParams.set('user',$('hoursUser').value);else url.searchParams.delete('user');history.replaceState(null,'',url);}
    render();
  }));
  $('hoursRefresh').addEventListener('click',load);
  if(window.steadyHandsAdminSession)load();
  else window.addEventListener('steadyhands:admin-ready',load,{once:true});
  window.SteadyHandsWorkHours={compute};
})();
