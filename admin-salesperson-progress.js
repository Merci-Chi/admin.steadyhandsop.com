(()=>{'use strict';
const $=id=>document.getElementById(id),c=()=>window.steadyHandsCRMClient;
const uid=new URLSearchParams(location.search).get('user');
const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const date=s=>s?new Date(s).toLocaleString():'Not recorded';
const box=(label,value)=>`<div class="progress-stat"><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`;
function rows(container,data,render,empty){$(container).innerHTML=data.length?data.map(render).join(''):`<p>${escape(empty)}</p>`;}
async function run(){if(!c())return;if(!uid){$('progressNotice').textContent='Select a salesperson from Users first.';return;}
$('progressNotice').textContent='Loading recorded activity…';$('progressStats').innerHTML='';
const sources=[
['profile',()=>c().from('callcenter_profiles').select('display_name,email,last_call_at').eq('user_id',uid).maybeSingle()],
['calls',()=>c().from('callcenter_call_activity').select('created_at,duration_seconds,outcome,caller_id_used,crm_id').eq('user_id',uid).order('created_at',{ascending:false}).limit(1000)],
['tasks',()=>c().from('outreach_tasks').select('title,status,priority,due_at,completed_at').eq('assigned_to',uid).order('created_at',{ascending:false}).limit(1000)],
['sales',()=>c().from('outreach_sales').select('company_name,status,registered_at,agreement_at,payment_at,hosting_at,launch_at,confirmed_at').eq('salesperson_user_id',uid).limit(1000)],
['opportunities',()=>c().from('sh_sales_opportunities').select('company_name,stage,follow_up_at').eq('salesperson_user_id',uid).limit(1000)],
['logins',()=>c().from('callcenter_login_activity').select('signed_in_at').eq('user_id',uid).order('signed_in_at',{ascending:false}).limit(1)],
['onboarding',()=>c().from('sh_employee_onboarding').select('status,agreement_status,completed_at').eq('user_id',uid).maybeSingle()]
];
const result=await Promise.all(sources.map(async ([k,fn])=>{try{const x=await fn();return [k,x]}catch(e){return [k,{error:e}]}}));
const r=Object.fromEntries(result),data=k=>r[k]?.error?null:r[k]?.data||null, arr=k=>data(k)||[];
const errors=result.filter(([,v])=>v.error).map(([k,v])=>`${k}: ${v.error.message||v.error}`);
const p=data('profile');$('progressTitle').textContent=p?.display_name||p?.email||'Salesperson progress';
const calls=arr('calls'),tasks=arr('tasks'),sales=arr('sales'),opps=arr('opportunities'),logins=arr('logins'),onboarding=data('onboarding');
const complete=tasks.filter(x=>x.status==='completed').length,paid=sales.filter(x=>!!x.payment_at).length,confirmed=sales.filter(x=>!!x.confirmed_at).length;
$('progressStats').innerHTML=[box('Calls recorded',data('calls')?calls.length:'Unavailable'),box('Talk time',data('calls')?`${Math.round(calls.reduce((n,x)=>n+(Number(x.duration_seconds)||0),0)/60)} min`:'Unavailable'),box('Tasks completed',data('tasks')?`${complete} / ${tasks.length}`:'Unavailable'),box('Sales confirmed',data('sales')?confirmed:'Unavailable'),box('Customers with payment recorded',data('sales')?paid:'Unavailable'),box('Last login',data('logins')?date(logins[0]?.signed_in_at):'Unavailable'),box('Onboarding',r.onboarding?.error?'Unavailable':onboarding?.status||'No saved record'),box('Agreement',r.onboarding?.error?'Unavailable':onboarding?.agreement_status||'Not recorded')].join('');
rows('progressCalls',calls.slice(0,25),x=>`<p><strong>${escape(x.outcome||'No outcome')}</strong> · ${escape(date(x.created_at))} · ${escape(Math.round((x.duration_seconds||0)/60))} min · ${escape(x.caller_id_used||'Caller ID not recorded')}</p>`,'No calls recorded.');
rows('progressTasks',tasks.slice(0,30),x=>`<p><strong>${escape(x.title)}</strong> · ${escape(x.status)} · Due: ${escape(date(x.due_at))}</p>`,'No tasks assigned.');
rows('progressSales',sales.slice(0,30),x=>`<p><strong>${escape(x.company_name||'Customer')}</strong> · ${escape(x.status||'No status')} · Agreement: ${escape(x.agreement_at?'Recorded':'Pending')} · Payment: ${escape(x.payment_at?'Recorded':'Pending')} · Hosting: ${escape(x.hosting_at?'Recorded':'Pending')} · Launch: ${escape(x.launch_at?'Recorded':'Pending')}</p>`,'No sales records.');
rows('progressOpportunities',opps.slice(0,30),x=>`<p><strong>${escape(x.company_name||'Lead')}</strong> · ${escape(x.stage||'No stage')} · Follow-up: ${escape(date(x.follow_up_at))}</p>`,'No opportunity records.');
$('progressNotice').textContent=errors.length?'Some data could not be read: '+errors.join(' | '):'Loaded recorded data. Counts may be incomplete when a source has more than 1,000 records.';
}
$('progressReload').onclick=run;if(window.steadyHandsAdminSession)run();else addEventListener('steadyhands:admin-ready',run,{once:true});
})();