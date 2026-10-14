(() => {
 const root=document.querySelector('[data-qc-seal]');if(!root)return;
 const section=root.closest('#prep'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 root.innerHTML='<span class="qc-packing-art" aria-hidden="true"><span class="qc-pack-layer"></span><span class="qc-pack-layer"></span></span><span class="qc-packing-caption" aria-hidden="true"><b>PREPARE THE SAMPLES</b><span>Check each tube, then place it in the rack.</span></span><span class="qc-packing-route" aria-hidden="true"><i>Prepare</i><i>Pack</i><i>Label</i><i>Send</i></span>';
 root.dataset.phase='idle';root.dataset.step='0';
 const art=root.querySelector('.qc-packing-art'),layers=[...root.querySelectorAll('.qc-pack-layer')],title=root.querySelector('.qc-packing-caption b'),caption=root.querySelector('.qc-packing-caption span');
 const texts=[['PREPARE THE SAMPLES','Check each tube, then place it in the rack.'],['PACK WITH CARE','Place the rack inside and close the box.'],['LABEL & CHECK','Seal the parcel and attach its shipping label.'],['READY FOR HANDOFF','Arrange pickup or shipping with our team.']];
 const boundsX=[[0,360],[362,357],[720,347],[1080,368]],boundsY=[[70,325],[402,330],[750,295]];
 // A common camera scale and baseline avoid the size jumps between source poses.
 const poses=Array.from({length:12},(_,n)=>{const [x,w]=n===3?[1066,382]:boundsX[n%4],[y,h]=boundsY[Math.floor(n/4)];return `<svg viewBox="0 0 400 350" aria-hidden="true"><svg x="${(400-w)/2}" y="${340-h}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" overflow="hidden"><image href="/brand/assets/seal-packing-journey.png" width="1448" height="1086"/></svg></svg>`;});
 let loaded=false,visible=false,paused=false,raf=0,last=0,elapsed=0,current=-1,currentStep=-1;
 const step=n=>{if(n===currentStep)return;currentStep=n;root.dataset.step=n;title.textContent=texts[n][0];caption.textContent=texts[n][1];root.querySelectorAll('.qc-packing-route i').forEach((el,i)=>el.classList.toggle('is-done',i<=n));section.classList.toggle('qc-complete',n===3);};
 function render(t){const cycle=t%8400,n=Math.min(11,Math.floor(cycle/620)),start=n*620,duration=n===11?1580:620,blendStart=duration-(n===11?420:260),p=Math.max(0,Math.min(1,(cycle-start-blendStart)/(duration-blendStart))),mix=p*p*(3-2*p);
 if(n!==current){current=n;layers[0].innerHTML=poses[n];layers[1].innerHTML=poses[(n+1)%12];root.dataset.frame=n;step(n<3?0:n<7?1:n<9?2:3);}layers[0].style.opacity=1-mix;layers[1].style.opacity=mix;}
 function stop(){cancelAnimationFrame(raf);raf=0;last=0;}
 function tick(now){raf=0;if(!loaded||!visible||document.hidden||paused||reduced.matches)return;if(last)elapsed+=Math.min(now-last,80);last=now;render(elapsed);raf=requestAnimationFrame(tick);}
 function sync(){stop();if(!loaded)return;if(reduced.matches){render(11*620);root.dataset.phase='ready';root.setAttribute('aria-label','Sample preparation and shipping illustration');return;}root.setAttribute('aria-label',paused?'Resume sample preparation animation':'Pause sample preparation animation');root.setAttribute('aria-pressed',String(paused));root.dataset.phase=paused?'paused':'playing';if(visible&&!document.hidden&&!paused)raf=requestAnimationFrame(tick);}
 root.addEventListener('click',()=>{if(reduced.matches)return;paused=!paused;sync();});
 reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);sync();},{threshold:.15}):null;
 if(observer)observer.observe(root);else visible=true;
 const preload=new Image();preload.onload=()=>{loaded=true;render(0);sync();};preload.onerror=()=>{art.innerHTML='';art.style.background="url('/brand/assets/qc-seal-sprites.png') 33.3333% 100% / 400% 200% no-repeat";step(3);root.setAttribute('aria-label','Samples ready for handoff');};preload.src='/brand/assets/seal-packing-journey.png';
 addEventListener('pagehide',stop);addEventListener('pageshow',sync);
})();
