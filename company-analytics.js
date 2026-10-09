(() => {
'use strict';
const URL='https://glonbvrcudwuzjundrii.supabase.co',KEY='sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const weekStart=()=>{const now=new Date(),d=new Date(now.getFullYear(),now.getMonth(),now.getDate());d.setDate(d.getDate()-(d.getDay()+6)%7);return d};
const sameWeek=d=>d&&new Date(d)>=weekStart()&&new Date(d)<=new Date();
const distinct=(rows,key)=>new Set(rows.map(key).filter(Boolean)).size;
let mrr=0,costs=0;
function set(id,value){if($(id))$(id).textContent=value}
async function allRows(c,table,fields){
 const result=[];let from=0;
 while(true){
  const {data,error}=await c.from(table).select(fields).range(from,from+999);
  if(error)throw new Error(table+': '+error.message);
  result.push(...(data||[]));
  if(!data||data.length<1000)break;
  from+=1000;
  if(from>=250000)throw new Error('Reporting row limit exceeded for '+table);
 }
 return result;
}
const paid=c=>['pending','complete'].includes(String(c.status||'').toLowerCase());
const saleKey=c=>c.crm_id||c.source_payment_id||c.id;
function renderBenchmarks(){
 const benchmarks=[[.1,'Very low'],[.3,'Low'],[.5,'Moderate'],[1,'Strong'],[1.5,'Very strong'],[2,'Excellent'],[3,'Exceptional']];
 $('aBenchmarks').innerHTML=benchmarks.map(([rate,label])=>'<tr><td class="analytics-benchmark">'+rate+'%</td><td>'+label+'</td><td>'+Number((300*rate/100).toFixed(1))+'</td></tr>').join('');
}
async function load(){
 $('analyticsState').textContent='Loading live company totals…';$('analyticsData').hidden=true;
 try{
  if(!window.supabase)throw Error('Supabase client unavailable');
  const c=window.steadyHandsCRMClient||window.supabase.createClient(URL,KEY);
  const {data:{session},error:authError}=await c.auth.getSession();
  if(authError||!session)throw Error('Please sign in first.');
  const {data:permission,error:pErr}=await c.from('team_permissions').select('role,active').eq('user_id',session.user.id).maybeSingle();
  if(pErr||permission?.active!==true||permission?.role!=='ADMIN')throw Error('Active ADMIN access is required.');
  const [calls,commissions,subs,profiles]=await Promise.all([
   allRows(c,'callcenter_call_activity','id,user_id,crm_id,created_at'),
   allRows(c,'callcenter_commissions','id,user_id,crm_id,source_payment_id,status,created_at,pending_at,completed_at'),
   allRows(c,'square','id,crmid,userid,subscriptionid,customerid,name,company,email,status,cadence,amount,plan,startdate,canceled'),
   allRows(c,'callcenter_profiles','user_id,display_name,email')
  ]);
  const active=subs.filter(s=>String(s.status).toUpperCase()==='ACTIVE'&&String(s.cadence).toUpperCase()==='MONTHLY'&&!s.canceled&&s.subscriptionid);
  const subscriptions=[...new Map(active.map(s=>[s.subscriptionid,s])).values()];
  mrr=subscriptions.reduce((n,s)=>n+(Number(s.amount)||0),0);
  const hosting=subscriptions.filter(s=>/web|host|backend|standard/i.test(s.plan||'')).reduce((n,s)=>n+(Number(s.amount)||0),0);
  const paidCommissions=commissions.filter(paid);
  const uniquePaid=new Map(paidCommissions.map(s=>[saleKey(s),s]));
  const customerKey=s=>String(s.crmid||s.userid||s.name?.trim().toLowerCase()||s.email?.trim().toLowerCase()||s.customerid||s.subscriptionid);
  const uniqueActiveClients=distinct(subscriptions,customerKey);
  const customerFirst=new Map();
  for(const s of subscriptions){const key=customerKey(s),date=new Date(s.startdate||'1970-01-01');if(!customerFirst.has(key)||date<customerFirst.get(key))customerFirst.set(key,date)}
  const weekSubs=subscriptions.filter(s=>sameWeek(s.startdate));
  const paidThisWeek=[...uniquePaid.values()].filter(s=>sameWeek(s.pending_at||s.completed_at||s.created_at));
  const weeklyKeys=new Set([...customerFirst].filter(([key,date])=>sameWeek(date)).map(([key])=>key));
  paidThisWeek.forEach(s=>weeklyKeys.add(s.crm_id||s.source_payment_id||s.id));
  set('aCalls',calls.length.toLocaleString());
  const conversion=calls.length?uniquePaid.size/calls.length*100:0;
  set('aRate',calls.length?conversion.toFixed(2)+'%':'—');
  set('aRateLabel',calls.length?uniquePaid.size+' verified paid customers / '+calls.length+' recorded calls':'No recorded calls yet');
  set('aWeek',weeklyKeys.size.toLocaleString());
  set('aSubscribers',subscriptions.length.toLocaleString());
  set('aCustomers',uniqueActiveClients.toLocaleString());
  const clientLines=subscriptions.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))).map(s=>'<tr><td>'+esc(s.name||'Customer not recorded')+'<div class="analytics-muted">'+esc(s.company||s.email||'')+'</div></td><td>'+esc(s.plan||'Unspecified plan')+'</td><td>'+esc(s.status)+'</td><td>'+money(Number(s.amount)||0)+'</td></tr>');
  $('aSubscriptionRows').innerHTML=clientLines.join('')+'<tr><th colspan="3">Total monthly subscriptions ('+subscriptions.length+')</th><th>'+money(mrr)+'</th></tr>';
  set('aHosting',money(hosting));set('aMrr',money(mrr));
  set('aSales',uniquePaid.size.toLocaleString());
  costs=Number(localStorage.getItem('cc_analytics_costs')||0);
  $('aCosts').value=(costs/100).toFixed(2);
  updateProfit();
  const names=new Map(profiles.map(p=>[p.user_id,p.display_name||p.email||'Unnamed caller']));
  const ids=new Set([...calls.map(x=>x.user_id),...paidCommissions.map(x=>x.user_id)].filter(Boolean));
  const rows=[...ids].map(id=>{
   const weeklyCalls=calls.filter(x=>x.user_id===id&&sameWeek(x.created_at)).length;
   const weeklySales=distinct(paidThisWeek.filter(x=>x.user_id===id),saleKey);
   return {name:names.get(id)||'Salesperson',weeklyCalls,weeklySales,rate:weeklyCalls?100*weeklySales/weeklyCalls:0};
  }).sort((a,b)=>b.weeklySales-a.weeklySales||b.weeklyCalls-a.weeklyCalls);
  $('aTeam').innerHTML=rows.length?rows.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+r.weeklyCalls+'</td><td>'+r.weeklySales+'</td><td>'+(r.weeklyCalls?r.rate.toFixed(2)+'%':'—')+'</td></tr>').join(''):'<tr><td colspan="4">No calls or paid sales recorded yet.</td></tr>';
  renderBenchmarks();$('analyticsState').textContent='Updated '+new Date().toLocaleString();$('analyticsData').hidden=false;
 }catch(e){$('analyticsState').innerHTML='<span class="analytics-error">'+esc(e.message)+'</span><p>Reporting needs administrator SELECT access to the source tables; no figures are estimated when access fails.</p>';console.error(e)}
}
function updateProfit(){set('aProfit',money(mrr-costs))}
$('aSaveCosts').addEventListener('click',()=>{costs=Math.max(0,Math.round((Number($('aCosts').value)||0)*100));localStorage.setItem('cc_analytics_costs',String(costs));updateProfit()});
$('analyticsRefresh').addEventListener('click',load);
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();