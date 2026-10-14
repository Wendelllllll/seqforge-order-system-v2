(() => {
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const desktop=matchMedia('(min-width:761px) and (pointer:fine)');
  let scroller=null;
  function configure(){
    scroller?.destroy();scroller=null;
    document.documentElement.classList.remove('sf-smooth');
    if(!window.Lenis||reduce.matches||!desktop.matches||document.body.classList.contains('motion-paused'))return;
    scroller=new Lenis({autoRaf:true,lerp:.14,smoothWheel:true,syncTouch:false,wheelMultiplier:1,
      anchors:false,stopInertiaOnNavigate:true,
      prevent:node=>node.matches?.('dialog,textarea,select,[data-lenis-prevent],.page-nav nav,.compare-table,.spec-scroll,.sequence-lines')
    });
    document.documentElement.classList.add('sf-smooth');
  }
  document.addEventListener('click',event=>{
    if(!scroller||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const a=event.target.closest('a[href]');if(!a||a.target||a.hasAttribute('download'))return;
    const url=new URL(a.href,location.href);
    if(url.origin!==location.origin||url.pathname!==location.pathname||url.search!==location.search||!url.hash)return;
    let id;try{id=decodeURIComponent(url.hash.slice(1));}catch{return;}
    const target=document.getElementById(id);if(!target)return;
    event.preventDefault();
    const details=target.closest('details');if(details)details.open=true;
    scroller.resize();
    const offset=parseFloat(getComputedStyle(target).scrollMarginTop)||0;
    history.pushState(null,'',url.hash);
    scroller.scrollTo(target,{offset,duration:.85,lerp:0});
  });
  // Dialogs retain their own native scroll; opening one also cancels page momentum.
  const modalObserver=new MutationObserver(()=>{
    if(!scroller)return;
    document.querySelector('dialog[open]')?scroller.stop():scroller.start();
  });
  document.querySelectorAll('dialog').forEach(dialog=>modalObserver.observe(dialog,{attributes:true,attributeFilter:['open']}));
  document.addEventListener('seqforge-motion',configure);
  reduce.addEventListener('change',configure);desktop.addEventListener('change',configure);
  addEventListener('pagehide',()=>{scroller?.destroy();scroller=null;});
  addEventListener('pageshow',configure);
  configure();
})();

