(() => {
  const toggle=document.querySelector('.scene-motion');
  if(!toggle)return;
  toggle.addEventListener('click',()=>{
    const paused=document.body.classList.toggle('motion-paused');
    toggle.setAttribute('aria-pressed',String(paused));
    toggle.textContent=paused?'Play motion':'Pause motion';
    document.dispatchEvent(new CustomEvent('seqforge-motion',{detail:{paused}}));
  });
})();
