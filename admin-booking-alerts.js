(() => {
'use strict';
const TABLE='sh_consultation_bookings';
const INTERVAL=20000;
const CLIENT_KEY='sh-booking-notifications';
let active=false, fetching=false, knownIds=null, lastCheck=0;

function setBadge(count){
  document.querySelectorAll('a[href="bookings.html"]').forEach(link=>{
    let badge=link.querySelector('.sh-booking-alert-badge');
    if(!badge){badge=document.createElement('span');badge.className='sh-booking-alert-badge';link.appendChild(badge);}
    badge.textContent=count>99?'99+':String(count);
    badge.hidden=count===0;
    link.setAttribute('aria-label',count?('Bookings, '+count+' submitted requests'):'Bookings');
  });
  document.title=document.title.replace(/^\\(\\d+\\+?\\)\\s*/, '');
  if(count && !location.pathname.endsWith('/bookings.html'))document.title='('+count+') '+document.title;
}

function toast(message){
  let el=document.getElementById('shBookingGlobalToast');
  if(!el){el=document.createElement('div');el.id='shBookingGlobalToast';el.className='sh-booking-global-toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}
  el.textContent=message;el.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true;},6000);
}

async function browserAlert(count){
  if(!('Notification' in window)||Notification.permission!=='granted'||localStorage.getItem('sh-bookings-alerts')!=='yes')return;
  const title=count===1?'New consultation request':count+' new consultation requests';
  const opts={body:'Open Steady Hands Admin to review.',icon:'images/icon-192.png',tag:'steadyhands-booking-arrival',data:{url:'bookings.html'}};
  try{
    const reg='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration():null;
    if(reg?.showNotification)await reg.showNotification(title,opts);
    else new Notification(title,opts);
  }catch(err){console.warn('Notification unavailable:',err);}
}

async function check(){
  if(!active||fetching||document.hidden||!window.steadyHandsAdminSession)return;
  fetching=true;
  try{
    const client=window.steadyHandsCRMClient;
    const {data,error,count}=await client.from(TABLE).select('id,created_at',{count:'exact'}).eq('status','submitted').order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    const ids=new Set((data||[]).map(r=>String(r.id)));
    const pending=Number(count)||0;
    setBadge(pending);
    if(knownIds!==null){
      const added=(data||[]).filter(r=>!knownIds.has(String(r.id))).length;
      if(added){
        toast(added===1?'New consultation booking received!':added+' new consultation bookings received!');
        browserAlert(added);
        window.dispatchEvent(new CustomEvent('steadyhands:bookings-changed'));
      }
    }
    knownIds=ids;lastCheck=Date.now();
  }catch(error){
    console.warn('Booking badge unavailable:',error);
    // Do not clear the previous count on a temporary network or RLS failure.
  }finally{fetching=false;}
}
function init(){
  if(active||!window.steadyHandsAdminSession)return;
  active=true;check();
  setInterval(check,INTERVAL);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener('focus',()=>{if(Date.now()-lastCheck>INTERVAL)check();});
  window.addEventListener('steadyhands:booking-status-saved',check);
}
window.addEventListener('steadyhands:admin-ready',init);
if(window.steadyHandsAdminSession)init();
})();
