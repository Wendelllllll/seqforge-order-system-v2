/* Draw real pose frames as horizontal ink lines. Pointer input reveals detail;
   the character's shape is never warped or stretched. */
(() => {
 const root=document.querySelector('[data-lab-seal]');if(!root)return;
 const stage=root.querySelector('.lab-seal-stage'),canvas=stage.querySelector('canvas'),pause=root.querySelector('.lab-seal-pause');
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(pointer:fine)');
 const names=['sample','dna','report'],index=names.indexOf(root.dataset.labSeal);
 const align=[[[0,0],[19,-1],[12,-1],[-4,19],[8,19],[16,19]],[[0,0],[0,0],[-1,0],[0,65],[0,65],[-1,65]],[[0,0],[4,0],[17,0],[2,3],[6,3],[6,3]]][index];
 const size=340,W=460,H=330,side=300,left=75,top=10;
 const duration=[850,300,360,540,300,800],cycle=duration.reduce((a,b)=>a+b,0)+1500;
 let frames=[],raf=0,ready=false,visible=false,paused=false,start=performance.now(),last=0,clock=0,scan=.5,target=.5,hover=false,replayAt=-1,previousFrame=-1;
 function surface(w=size,h=size){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
 function prepare(sheet){
  const sw=sheet.naturalWidth/3,sh=sheet.naturalHeight/2;
  for(let f=0;f<6;f++){
   const full=surface(),fx=full.getContext('2d',{willReadFrequently:true}),[dx,dy]=align[f];
   fx.drawImage(sheet,(f%3)*sw,Math.floor(f/3)*sh,sw,sh,dx*size/sw,dy*size/sh,size,size);
   const pixels=fx.getImageData(0,0,size,size).data,lines=surface(),lx=lines.getContext('2d'),edges=[];
   // These pre-rendered line drawings preserve the eyes, flippers and lab tools.
   for(let y=1;y<size;y+=3){
    let first=-1,lastX=-1;
    for(let x=0;x<size;x++){
     const i=(y*size+x)*4,a=pixels[i+3]/255;if(a<.36)continue;
     if(first<0)first=x;lastX=x;
     const luminance=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255;
     const dark=1-luminance,ink=dark>.48;
     lx.fillStyle=ink?`rgba(18,46,72,${a*(.65+dark*.35)})`:`rgba(0,128,111,${a*(.3+dark*.65)})`;
     lx.fillRect(x,y,1,ink?1.75:1.05);
    }
    if(first>=0)edges.push({y,first,last:lastX});
   }
   frames.push({full,lines,edges});
  }
 }
 function resize(){const r=stage.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);if(ready)draw(performance.now(),true)}
 function frameFor(time){let t=((time-start)%cycle+cycle)%cycle;for(let i=0;i<duration.length;i++){if(t<duration[i])return i;t-=duration[i]}return 0}
 function draw(now,still=false){
  if(!ready)return;
  const staticMode=paused||reduce.matches;
  if(!staticMode&&!still){clock+=Math.min(now-last||33,70);scan+=(target-scan)*.13}
  last=now;const f=staticMode?Math.max(0,previousFrame):frameFor(now);previousFrame=f;
  const frame=frames[f];ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
  // A very light original silhouette keeps the brand's mint and cream recognizable.
  ctx.globalAlpha=.15;ctx.drawImage(frame.full,left,top,side,side);ctx.globalAlpha=1;ctx.drawImage(frame.lines,left,top,side,side);
  const center=(hover?scan:.5+Math.sin(clock/2300)*.31)*W;
  if(!reduce.matches){
   ctx.lineWidth=.65;
   for(let i=0;i<frame.edges.length;i++){
    if(i%2!==0)continue;const e=frame.edges[i],y=top+e.y/size*side,x=left+e.last/size*side;
    const rhythm=.5+.5*Math.sin(i*.52+clock/1700),len=(15+rhythm*53)*(hover?1.25:1);
    ctx.strokeStyle=`rgba(0,135,116,${.045+rhythm*.085})`;ctx.beginPath();ctx.moveTo(x+5,y);ctx.lineTo(Math.min(W-5,x+len),y);ctx.stroke();
   }
   // A soft, local scanner reveals full-color detail without displacing the image.
   ctx.save();ctx.beginPath();ctx.rect(center-28,0,56,H);ctx.clip();ctx.globalAlpha=hover?.7:.34;ctx.drawImage(frame.full,left,top,side,side);ctx.restore();
   ctx.globalAlpha=hover?.28:.12;ctx.fillStyle='#00a99d';ctx.fillRect(center,38,1,254);ctx.globalAlpha=1;
  }
  canvas.dataset.frame=String(f);canvas.dataset.scan=scan.toFixed(3);
  if(replayAt>=0&&now-replayAt>duration.reduce((a,b)=>a+b,0)){root.querySelector('.lab-seal-announcement').textContent=root.dataset.complete;replayAt=-1}
 }
 function animate(now){raf=0;if(!canRun())return;if(now-last>=32)draw(now);raf=requestAnimationFrame(animate)}
 function canRun(){return ready&&visible&&!paused&&!reduce.matches&&!document.hidden}
 function sync(){cancelAnimationFrame(raf);raf=0;last=performance.now();if(ready)draw(performance.now(),true);if(canRun())raf=requestAnimationFrame(animate)}
 stage.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||!fine.matches||paused||reduce.matches)return;const r=stage.getBoundingClientRect();target=Math.max(.08,Math.min(.92,(e.clientX-r.left)/r.width));hover=true});
 stage.addEventListener('pointerleave',()=>{hover=false});
 stage.addEventListener('click',()=>{if(!ready)return;start=performance.now();replayAt=start;paused=false;previousFrame=0;root.querySelector('.lab-seal-announcement').textContent=reduce.matches?root.dataset.complete:root.dataset.action;sync()});

 const observer=new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible)start=performance.now();sync()},{threshold:.05});observer.observe(stage);
 const sheet=new Image();sheet.onload=()=>{try{prepare(sheet);ready=true;resize();root.classList.add('ready');sync()}catch(e){root.classList.add('static-fallback');console.warn('Seal scene uses its static image.',e.message)}};
 sheet.onerror=()=>root.classList.add('static-fallback');sheet.src=`/brand/assets/seal-${root.dataset.labSeal}${root.dataset.labSeal==='report'?'':'-coat'}-frames.png`;
 window.addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',sync);reduce.addEventListener('change',sync);
})();
