/* Report pixels disperse and reassemble only when a result view changes. */
(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const clamp = n => Math.max(0, Math.min(1, n));
  const random = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function snapshot(element, bounds) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bounds.width); canvas.height = Math.ceil(bounds.height);
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    if (!ctx) return [];
    // Draw existing vector data, preserving the report's geometry and colors.
    element.querySelectorAll('svg path,svg circle,svg line,svg rect,svg polyline,svg polygon').forEach(shape => {
      const style = getComputedStyle(shape), matrix = shape.getScreenCTM();
      if (!matrix || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return;
      const attr = name => Number(shape.getAttribute(name) || 0);
      const path = new Path2D();
      try {
        if (shape.tagName === 'path') path.addPath(new Path2D(shape.getAttribute('d') || ''));
        else if (shape.tagName === 'circle') path.arc(attr('cx'),attr('cy'),attr('r'),0,Math.PI*2);
        else if (shape.tagName === 'rect') path.rect(attr('x'),attr('y'),attr('width'),attr('height'));
        else if (shape.tagName === 'line') { path.moveTo(attr('x1'),attr('y1')); path.lineTo(attr('x2'),attr('y2')); }
        else { const points=shape.points; for(let i=0;i<points.length;i++){const p=points.getItem(i);i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y);} if(shape.tagName==='polygon')path.closePath(); }
        ctx.save(); ctx.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-bounds.left,matrix.f-bounds.top);
        ctx.globalAlpha = Number(style.opacity);
        if(style.fill !== 'none'){ctx.fillStyle=style.fill;ctx.fill(path);}
        if(style.stroke !== 'none'){ctx.strokeStyle=style.stroke;ctx.lineWidth=parseFloat(style.strokeWidth)||1;ctx.stroke(path);}
        ctx.restore();
      } catch { ctx.restore(); }
    });
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    let node, words=0;
    while((node=walker.nextNode()) && words<700){
      const parent=node.parentElement;
      if(!parent || parent.closest('[hidden],script,style,select,.fx-tooltip,.fx-hint'))continue;
      const style=getComputedStyle(parent);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;
      ctx.font=style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillStyle=parent.closest('svg')?style.fill:style.color;
      ctx.textBaseline='top';
      for(const match of node.textContent.matchAll(/\S+/g)){
        const range=document.createRange(); range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
        const rect=range.getBoundingClientRect();
        if(rect.width && rect.height && rect.bottom>bounds.top && rect.top<bounds.bottom){
          ctx.fillText(match[0],rect.left-bounds.left,rect.top-bounds.top+Math.max(0,(rect.height-parseFloat(style.fontSize))*.5)); words++;
        }
      }
    }
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
    const points=[], step=innerWidth<700?3:2;
    for(let y=0;y<canvas.height;y+=step)for(let x=0;x<canvas.width;x+=step){
      const i=(y*canvas.width+x)*4;
      if(data[i+3]>50 && Math.min(data[i],data[i+1],data[i+2])<205)
        points.push({x,y,color:`rgb(${data[i]} ${data[i+1]} ${data[i+2]})`,alpha:data[i+3]/255});
    }
    const stride=Math.max(1,Math.ceil(points.length/(innerWidth<700?2600:6500)));
    return points.filter((_,i)=>i%stride===0);
  }
  function run(host, previous, update, next) {
    active.get(host)?.();
    if(motion.matches || !previous || !host.getBoundingClientRect().width){update();return;}
    let canvas, raf=0, target, savedClip='', done=false;
    const cleanup=()=>{
      if(done)return;done=true;cancelAnimationFrame(raf);canvas?.remove();
      if(target)target.style.clipPath=savedClip;
      host.classList.remove('report-transitioning');active.delete(host);
      host.removeEventListener('pointerdown',cleanup);host.removeEventListener('keydown',cleanup);
    };
    let committed=false;
    try {
      const before=host.getBoundingClientRect();
      const oldPoints=snapshot(previous,before);
      update();committed=true;
      target=next();if(!target)return;
      const bounds=host.getBoundingClientRect(),newPoints=snapshot(target,bounds);
      if(!oldPoints.length || !newPoints.length)return;
      canvas=document.createElement('canvas');canvas.className='report-particles';canvas.setAttribute('aria-hidden','true');
      const width=bounds.width,height=bounds.height,dpr=Math.min(devicePixelRatio||1,2);
      canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      const ctx=canvas.getContext('2d');if(!ctx)return;
      ctx.scale(dpr,dpr);host.append(canvas);host.classList.add('report-transitioning');
      savedClip=target.style.clipPath;target.style.clipPath='inset(0 100% 0 0)';
      active.set(host,cleanup);host.addEventListener('pointerdown',cleanup,{once:true});host.addEventListener('keydown',cleanup,{once:true});
      const start=performance.now(),duration=innerWidth<700?720:940;
      function frame(now){
        if(done)return;
        const progress=clamp((now-start)/duration);
        ctx.clearRect(0,0,width,height);
        const draw=(points,incoming)=>points.forEach((p,i)=>{
          const phase=clamp((progress-(incoming?.26:0)-p.x/width*.15)/(incoming?.66:.58));
          const scatter=incoming?1-phase:phase,seed=random(i+11),angle=(random(i+53)-.5)*3.8;
          const distance=(22+seed*90)*scatter;
          const x=p.x+distance*Math.cos(angle),y=p.y+distance*Math.sin(angle)-scatter*22;
          const opacity=incoming?Math.sin(phase*Math.PI*.5):1-phase;
          ctx.globalAlpha=opacity*p.alpha;ctx.fillStyle=p.color;
          const size=1.5+scatter*seed*1.7;ctx.fillRect(x,y,size,size);
        });
        draw(oldPoints,false);draw(newPoints,true);ctx.globalAlpha=1;
        const reveal=clamp((progress-.66)/.34);
        target.style.clipPath=`inset(0 ${(1-reveal)*100}% 0 0)`;
        canvas.style.opacity=String(1-clamp((progress-.85)/.15));
        if(progress<1)raf=requestAnimationFrame(frame);else cleanup();
      }
      raf=requestAnimationFrame(frame);
    } catch {cleanup();if(!committed)update();}
  }
  motion.addEventListener('change',()=>{if(motion.matches)[...active.values()].forEach(stop=>stop());});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)[...active.values()].forEach(stop=>stop());});
  window.addEventListener('resize',()=>[...active.values()].forEach(stop=>stop()));
  window.SeqForgeParticles={run};
})();
