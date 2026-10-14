(() => {
  const cards=[...document.querySelectorAll('.seal-card')];
  const toggle=document.querySelector('.seal-motion-toggle');
  if(!toggle||!cards.length)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const names=['sample','dna','report'];
  // Align the drawn feet between cells; only position changes, never shape.
  const alignment=[
    [[0,0],[9,0],[35,0],[-6,31],[9,31],[32,32]],
    [[0,0],[2,1],[15,1],[1,34],[2,34],[2,34]],
    [[0,0],[14,0],[27,0],[0,23],[14,23],[21,22]]
  ];
  const scenes=[];
  let paused=false,timer=0;
  const durations=[700,180,260,400,180,600];
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{const s=scenes.find(s=>s.card===entry.target);if(s)s.visible=entry.isIntersecting;});sync();
  },{threshold:.05});
  function active(){return !paused&&!reduced.matches&&!document.hidden&&!document.body.classList.contains('motion-paused');}
  function draw(s){
    const size=Math.max(1,Math.round(s.canvas.clientWidth*Math.min(devicePixelRatio||1,2)));
    if(s.canvas.width!==size||s.canvas.height!==size){s.canvas.width=size;s.canvas.height=size;}
    const w=s.sheet.naturalWidth/3,h=s.sheet.naturalHeight/2;
    s.ctx.clearRect(0,0,size,size);
    // Display one actual drawn pose. No mesh deformation, rotation, or morphing.
    const [dx,dy]=alignment[s.index][s.frame];
    s.ctx.drawImage(s.sheet,(s.frame%3)*w,Math.floor(s.frame/3)*h,w,h,dx*size/w,dy*size/h,size,size);
    s.canvas.dataset.frame=String(s.frame);
  }
  function tick(){
    timer=0;
    scenes.filter(s=>s.ready&&s.visible).forEach(s=>{s.left-=50;if(s.left<=0){s.frame=(s.frame+1)%6;s.left=durations[s.frame];draw(s);}});
    if(active()&&scenes.some(s=>s.ready&&s.visible))timer=setTimeout(tick,50);
  }
  function sync(){
    clearTimeout(timer);timer=0;
    toggle.hidden=!scenes.some(s=>s.ready)||reduced.matches;
    toggle.textContent=paused?'Play seal animations':'Pause seal animations';toggle.setAttribute('aria-pressed',String(paused));
    if(active()&&scenes.some(s=>s.ready&&s.visible))timer=setTimeout(tick,50);
  }
  cards.forEach((card,i)=>{
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
    const sheet=new Image();
    const s={card,canvas,ctx,sheet,index:i,frame:0,left:durations[0]+i*240,ready:false,visible:false};
    scenes.push(s);card.querySelector('.seal-pose').append(canvas);observer.observe(card);
    sheet.onload=()=>{s.ready=true;draw(s);card.classList.add('seal-animated');sync();};
    sheet.onerror=()=>{canvas.remove();};
    sheet.src='/brand/assets/seal-'+names[i]+'-frames.png';
  });
  toggle.addEventListener('click',()=>{paused=!paused;sync();});
  window.addEventListener('resize',()=>scenes.filter(s=>s.ready).forEach(draw),{passive:true});
  document.addEventListener('visibilitychange',sync);document.addEventListener('seqforge-motion',sync);reduced.addEventListener('change',sync);
})();
