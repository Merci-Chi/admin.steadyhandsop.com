/* Same-page call detail popup for the Admin Performance lists. */
(() => {
  'use strict';
  let active=null;
  window.steadyHandsOpenAdminCall = ({ids,activityId,trigger}) => {
    active?.close();
    ids=[...new Set((ids||[]).filter(Boolean).map(String))];
    let index=ids.indexOf(String(activityId));
    if(index<0)return;
    const overlay=document.createElement('div');
    overlay.className='performance-detail-overlay';
    overlay.innerHTML='<section class="performance-detail-shell" role="dialog" aria-modal="true" aria-label="Call details" tabindex="-1"><header class="performance-detail-header"><strong>Call details</strong><span class="performance-detail-count" aria-live="polite"></span><button type="button" data-detail-close aria-label="Close call details">✕</button></header><div class="performance-detail-main"><button type="button" class="performance-detail-arrow" data-detail-prev aria-label="Previous call">‹</button><iframe class="performance-detail-frame" title="Call details" loading="eager"></iframe><button type="button" class="performance-detail-arrow" data-detail-next aria-label="Next call">›</button></div><footer>← Previous call &nbsp; · &nbsp; Next call → &nbsp; · &nbsp; Esc to close</footer></section>';
    const dialog=overlay.querySelector('[role="dialog"]');
    const frame=overlay.querySelector('iframe');
    const previous=overlay.querySelector('[data-detail-prev]');
    const next=overlay.querySelector('[data-detail-next]');
    const count=overlay.querySelector('.performance-detail-count');
    const change=delta=>{
      const candidate=index+delta;
      if(candidate<0||candidate>=ids.length)return;
      index=candidate;
      show();
    };
    const show=()=>{
      frame.src='call.html?id='+encodeURIComponent(ids[index]);
      count.textContent=(index+1)+' / '+ids.length;
      previous.disabled=index===0;
      next.disabled=index===ids.length-1;
    };
    const onKey=event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='ArrowLeft'){event.preventDefault();change(-1);}
      if(event.key==='ArrowRight'){event.preventDefault();change(1);}
    };
    frame.addEventListener('load',()=>{try{frame.contentDocument?.addEventListener('keydown',onKey,true);}catch(_error){/* iframe remains navigable via visible arrows */}});
    const close=()=>{
      document.removeEventListener('keydown',onKey,true);
      overlay.remove();
      if(active?.close===close)active=null;
      trigger?.focus?.();
    };
    overlay.querySelector('[data-detail-close]').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    previous.addEventListener('click',()=>change(-1));
    next.addEventListener('click',()=>change(1));
    document.addEventListener('keydown',onKey,true);
    document.body.appendChild(overlay);
    active={close};
    show();
    dialog.focus();
  };
})();
