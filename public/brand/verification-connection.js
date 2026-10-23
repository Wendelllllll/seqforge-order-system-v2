(() => {
 if (customElements.get('seqforge-connection')) return;
 let runtimePromise;
 function runtime(prefix){if(window.rive)return Promise.resolve(window.rive);if(!runtimePromise)runtimePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=prefix+'/vendor/rive/rive.js';script.onload=()=>resolve(window.rive);script.onerror=()=>{runtimePromise=null;reject(new Error('Animation unavailable'));};document.head.appendChild(script);});return runtimePromise;}
 class Connection extends HTMLElement {
  static get observedAttributes(){return ['state'];}
  connectedCallback(){
   if(this.shadowRoot)return;
   const root=this.attachShadow({mode:'open'});
   root.innerHTML=`<style>:host{display:block;position:relative;min-height:530px;background:#092238;color:#e9f7f3;overflow:hidden}canvas{position:absolute;inset:0;width:100%;height:100%}.copy{position:relative;padding:38px 34px;pointer-events:none}.eyebrow{font:10px monospace;letter-spacing:2px;color:#93bcbf}h2{font:400 clamp(28px,3vw,40px)/1.15 Arial,sans-serif;letter-spacing:-1px;max-width:300px;margin:25px 0 15px}p{font:14px/1.7 Arial,sans-serif;color:#a4bec9;max-width:280px}.foot{position:absolute;bottom:30px;left:34px;right:34px;border-top:1px solid #ffffff20;padding-top:18px;display:flex;align-items:center;gap:12px;font:10px monospace;letter-spacing:1px;color:#a4bec9}.dot{width:6px;height:6px;background:#66dfc4;border-radius:50%}@media(max-width:760px){:host{min-height:430px}.copy{padding:28px}h2{font-size:28px;margin-top:16px}}.success{position:absolute;left:50%;top:48%;width:220px;height:220px;transform:translateX(-50%);display:none;place-items:center;border-radius:50%;overflow:hidden;background:#0b5149;color:#b5ffe6;font:90px Arial;box-shadow:0 0 70px #5be0bc15}.success canvas{width:100%;height:100%;clip-path:circle(31.4%);transform:scale(1.58);filter:hue-rotate(36deg)}:host([state=verified]) .success{display:grid}.play{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);bottom:69px;left:34px;background:none;border:0;border-bottom:1px solid #ffffff30;padding:8px 0;color:#a6c9c7;font:11px Arial;cursor:pointer}.play:focus-visible{width:auto;height:auto;clip-path:none;outline:2px solid #93f4d5;outline-offset:5px}:host([state=verified]) .play{display:none}.sound{margin-left:auto;border:0;background:transparent;color:#a6c9c7;min-height:32px;padding:4px 0 4px 8px;font:10px Arial;cursor:pointer;white-space:nowrap}.sound:focus-visible{outline:2px solid #93f4d5;outline-offset:3px}</style><canvas aria-hidden="true"></canvas><div class="success" aria-hidden="true"><span>✓</span><canvas></canvas></div><button class="play" type="button">Play seal interaction</button><div class="copy"><div class="eyebrow">SEQFORGE / YOUR CONNECTION</div><h2></h2><p></p></div><div class="foot"><span class="dot"></span><span class="status"></span><button class="sound" type="button" aria-label="Mute verification sound" aria-pressed="false">♪ Sound on</button></div>`;
   this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.pointer={x:-10000,y:-10000};this.offset={x:0,y:0};this.gaze={x:0,y:0};this.follow={x:0,y:0,near:0};this.lastDraw=0;this.start=performance.now();this.visible=true;
   this.muted=false;try{this.muted=localStorage.getItem('seqforge-verification-muted')==='true';}catch{}
   this.soundButton=root.querySelector('.sound');this.refreshSound();
   this.unlockAudio=()=>{if(this.muted||this.audio?.state==='closed')return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;if(!this.audio)this.audio=new Audio();if(this.audio.state==='suspended')void this.audio.resume().catch(()=>{});}catch{}};
   this.soundButton.addEventListener('click',()=>{this.muted=!this.muted;try{localStorage.setItem('seqforge-verification-muted',String(this.muted));}catch{}this.refreshSound();if(!this.muted)this.unlockAudio();});
   document.addEventListener('pointerdown',this.unlockAudio,{passive:true});document.addEventListener('keydown',this.unlockAudio);
   this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.assetPrefix=this.getAttribute('asset-prefix')??'/brand';this.raised=0;this.clickedUntil=0;
   this.onHello=()=>{this.clickedUntil=performance.now()+2400;this.schedule();};root.querySelector('.play').addEventListener('click',this.onHello);
   this.onTap=e=>{const r=this.getBoundingClientRect();if(e.clientY-r.top>this.clientHeight*.4)this.onHello();};this.canvas.addEventListener('click',this.onTap);
   this.onMove=e=>{if(e.pointerType==='touch')return;const r=this.getBoundingClientRect();this.pointer={x:e.clientX-r.left,y:e.clientY-r.top};};this.onLeave=()=>this.pointer={x:-10000,y:-10000};
   document.addEventListener('pointermove',this.onMove,{passive:true});document.documentElement.addEventListener('pointerleave',this.onLeave);window.addEventListener('blur',this.onLeave);
   this.resize=new ResizeObserver(()=>{this.draw(performance.now());this.riveInstance?.resizeDrawingSurfaceToCanvas();});this.resize.observe(this);
   this.observer=new IntersectionObserver(es=>{this.visible=es[0].isIntersecting;this.schedule();});this.observer.observe(this);
   this.onVisibility=()=>this.schedule();document.addEventListener('visibilitychange',this.onVisibility);this.motion.addEventListener('change',this.onVisibility);this.update();
  }
  attributeChangedCallback(){this.start=performance.now();if(this.shadowRoot)this.update();}
  update(){const state=this.getAttribute('state')||'idle';const words={idle:['Your connection starts here.','Confirm your email to continue your research workflow.','AWAITING SIGN IN'],sending:['Making the connection.','Sending a verification link to your inbox.','SENDING LINK'],sent:['One step from discovery.','Open the link in your email. We’ll be here when you return.','AWAITING CONFIRMATION'],verified:['Connected. Ready for discovery.','Your email is confirmed. Continue whenever you’re ready.','EMAIL VERIFIED'],preview:['A preview of your connection.','No email has been sent in this test environment.','PREVIEW MODE'],error:['Let’s reconnect.','Check the message beside this panel, then request a fresh link.','ACTION NEEDED']}[state]||['One click. Connected.','Check your inbox.','AWAITING CONFIRMATION'];this.shadowRoot.querySelector('h2').textContent=words[0];this.shadowRoot.querySelector('p').textContent=words[1];this.shadowRoot.querySelector('.status').textContent=words[2];if(state==='verified'){this.showSuccess();if(this.previousState&&this.previousState!=='verified')this.playChime();}else{this.riveInstance?.cleanup();this.riveInstance=null;this.successLoading=false;}this.previousState=state;this.schedule();}
  refreshSound(){this.soundButton.textContent=this.muted?'Sound off':'♪ Sound on';this.soundButton.setAttribute('aria-pressed',String(this.muted));this.soundButton.setAttribute('aria-label',this.muted?'Enable verification sound':'Mute verification sound');}
  playChime(){
   // No autoplay workaround: a prior user gesture must have unlocked audio.
   if(this.muted||document.hidden||!this.audio||this.audio.state!=='running')return;
   const ctx=this.audio,now=ctx.currentTime;
   for(const [frequency,delay,volume] of [[1046.5,0,.085],[1567.98,.07,.032]]){const tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='sine';tone.frequency.value=frequency;gain.gain.setValueAtTime(0,now+delay);gain.gain.linearRampToValueAtTime(volume,now+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.7);tone.connect(gain);gain.connect(ctx.destination);tone.start(now+delay);tone.stop(now+delay+.75);tone.onended=()=>{tone.disconnect();gain.disconnect();};}
  }
  async showSuccess(){
   if(this.riveInstance||this.successLoading||this.motion.matches)return;this.shadowRoot.querySelector('.success span').style.visibility='visible';this.successLoading=true;
   try{const R=await runtime(this.assetPrefix);if(!this.isConnected||this.getAttribute('state')!=='verified')return;
    R.RuntimeLoader.setWasmUrl(this.assetPrefix+'/vendor/rive/rive.wasm');const canvas=this.shadowRoot.querySelector('.success canvas');
    const instance=new R.Rive({src:this.assetPrefix+'/assets/email-success.riv',canvas,autoplay:true,animations:'Animation 1',enableRiveAssetCDN:false,onLoad:()=>{instance.resizeDrawingSurfaceToCanvas();this.shadowRoot.querySelector('.success span').style.visibility='hidden';},onLoadError:()=>{this.shadowRoot.querySelector('.success span').style.visibility='visible';}});this.riveInstance=instance;
   }catch{this.shadowRoot.querySelector('.success span').style.visibility='visible';}finally{this.successLoading=false;}
  }
  schedule(){cancelAnimationFrame(this.raf);this.lastDraw=0;this.draw(performance.now());if(this.visible&&!document.hidden&&!this.motion.matches&&!['error','idle','preview'].includes(this.getAttribute('state')))this.raf=requestAnimationFrame(t=>this.tick(t));}
  tick(t){this.draw(t);this.raf=requestAnimationFrame(n=>this.tick(n));}
  draw(now){if(!this.ctx)return;const w=this.clientWidth,h=this.clientHeight,d=Math.min(devicePixelRatio||1,2),c=this.ctx;if(this.canvas.width!==w*d||this.canvas.height!==h*d){this.canvas.width=w*d;this.canvas.height=h*d;}c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,w,h);const state=this.getAttribute('state'),active=!this.motion.matches&&!['idle','error','preview'].includes(state),t=active?(now-this.start)/1000:0,ok=state==='verified';

   const moving=active&&!document.hidden, aim=this.pointer.x>-9999,dt=Math.min(.05,Math.max(.001,(now-(this.lastDraw||now-16.67))/1000));this.lastDraw=now;
   const blend=1-Math.exp(-dt*10),slow=1-Math.exp(-dt*6),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
   const targetX=aim?clamp((this.pointer.x/w-.5)*12,-8,8):0,targetY=aim?clamp((this.pointer.y/h-.5)*8,-6,6):0;
   this.offset.x+=(targetX-this.offset.x)*slow;this.offset.y+=(targetY-this.offset.y)*slow;
   const glow=c.createRadialGradient(w*.52,h*.59,0,w*.52,h*.59,w*.7);glow.addColorStop(0,'#146c6c44');glow.addColorStop(1,'#09223800');c.fillStyle=glow;c.fillRect(0,0,w,h);
   // Sparse, deterministic depth markers instead of a rigid full-panel grid.
   for(let i=0;i<30;i++){const x=(i*137.31)%w,y=h*.35+(i*71.7)%(h*.49);c.fillStyle='rgba(140,209,204,'+(.09+(i%4)*.035)+')';c.beginPath();c.arc(x,y+(moving?Math.sin(t*.3+i)*3:0),i%5===0?1.3:.6,0,Math.PI*2);c.fill();}

   // Decorative biology diagrams remain at the edges, behind the mascot.
   c.save();c.translate(this.offset.x*.22,this.offset.y*.22);c.lineWidth=1;
   const artTop=Math.max(h*.4,this.shadowRoot.querySelector('.copy').offsetHeight+10),artBottom=h-123;
   for(let side=0;side<2;side++){c.beginPath();for(let i=0;i<=64;i++){const u=i/64,xx=w*.16+Math.sin(u*Math.PI*4+(moving?t*.12:0)+side*Math.PI)*22,yy=artTop+u*(artBottom-artTop);if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);}c.strokeStyle=side?'#82aeca20':'#80dac52b';c.stroke();}
   for(let i=0;i<16;i++){const u=i/15,delta=Math.sin(u*Math.PI*4+(moving?t*.12:0))*22,yy=artTop+u*(artBottom-artTop);c.beginPath();c.moveTo(w*.16-delta,yy);c.lineTo(w*.16+delta,yy);c.strokeStyle='#8dd3c51c';c.stroke();}
   for(let j=0;j<3;j++){const cx=w*.82+(j%2)*15,cy=artTop+24+j*42;c.beginPath();for(let i=0;i<=6;i++){const a=i*Math.PI/3,xx=cx+24*Math.cos(a),yy=cy+24*Math.sin(a);if(!i)c.moveTo(xx,yy);else c.lineTo(xx,yy);}c.strokeStyle='#9fcbd125';c.stroke();for(let i=0;i<6;i+=2){const a=i*Math.PI/3;c.beginPath();c.arc(cx+24*Math.cos(a),cy+24*Math.sin(a),2,0,Math.PI*2);c.fillStyle='#a6e1d538';c.fill();}}
   c.beginPath();for(let i=0;i<=100;i++){const u=i/100,peak=Math.exp(-Math.pow((u-.2)/.025,2))*16+Math.exp(-Math.pow((u-.52)/.035,2))*25+Math.exp(-Math.pow((u-.77)/.025,2))*19,xx=w*.71+u*w*.23,yy=artBottom-peak;if(!i)c.moveTo(xx,yy);else c.lineTo(xx,yy);}c.strokeStyle='#8ddbc632';c.stroke();c.restore();
   if(ok)return;

   const top=Math.max(h*.38,this.shadowRoot.querySelector('.copy').offsetHeight+8),size=Math.max(150,Math.min(340,w*.79,(h-top-145)*1.05)),x=(w-size)/2,y=top;
   const dx=aim?this.pointer.x-(x+size*.5):0,dy=aim?this.pointer.y-(y+size*.4):0,distance=Math.hypot(dx,dy);
   const near=aim?1-clamp((distance-size*.25)/(size*.85),0,1):0,smoothNear=near*near*(3-2*near),directionX=clamp(dx/(size*.65),-1,1),directionY=clamp(dy/(size*.55),-1,1);
   this.gaze.x+=((aim?directionX*10:0)-this.gaze.x)*blend;this.gaze.y+=((aim?directionY*7:0)-this.gaze.y)*blend;
   this.follow.x+=(directionX*smoothNear-this.follow.x)*slow;this.follow.y+=(directionY*smoothNear-this.follow.y)*slow;this.follow.near+=(smoothNear-this.follow.near)*slow;
   const target=Math.max(smoothNear,now<this.clickedUntil?1:0);this.raised=this.motion.matches?0:this.raised+(target-this.raised)*slow;
   const delight=clamp((this.raised-.25)/.65,0,1),bliss=delight*delight*(3-2*delight);
   const lift=this.raised,gx=this.motion.matches?0:this.gaze.x,gy=this.motion.matches?0:this.gaze.y,fx=this.motion.matches?0:this.follow.x,fy=this.motion.matches?0:this.follow.y;
   const blinkPhase=t%5.2,blink=active?Math.max(0,1-Math.abs(blinkPhase-4.95)/.14):0,eyeOpen=Math.max(.06,1-blink*.94);
   c.save();c.translate(x,y);c.scale(size/400,size/400);c.lineCap='round';c.lineJoin='round';c.lineWidth=4;c.strokeStyle='#f5fafc';
   c.save();c.translate(200+fx*13,170+fy*9);c.rotate(fx*.055-bliss*.075);c.translate(-200,-170);
   const path=(d,fill)=>{const p=new Path2D(d);if(fill){c.fillStyle=fill;c.fill(p);}c.stroke(p);};
   // Facial silhouette and feature placement follow the supplied white-line brand mark.
   path('M34 201 C41 176 31 113 71 65 C101 23 151 13 200 14 C255 14 309 36 337 83 C362 122 360 176 367 202 Q383 220 366 226 L383 249 L365 244 C348 287 283 315 202 317 C118 318 55 291 36 246 L18 253 L34 229 Q19 220 34 201 Z');
   path('M111 77 Q125 61 140 71');path('M264 70 Q281 61 294 78');
   for(const [ex,ey,rot] of [[122,141,.28],[278,141,-.28]]){
    c.save();c.translate(ex,ey);c.rotate(rot);
    c.globalAlpha=1-bliss;c.scale(1,eyeOpen*(1-bliss*.65));{c.beginPath();c.ellipse(0,0,31,39,0,0,Math.PI*2);c.stroke();c.save();c.translate(gx*.65,gy);c.fillStyle='#f5fafc';c.beginPath();c.arc(-5,-15,9,0,Math.PI*2);c.fill();c.beginPath();c.arc(9,3,4,0,Math.PI*2);c.fill();path('M-21 0 Q-22 31 13 25');c.restore();}c.restore();
    c.save();c.globalAlpha=bliss;c.beginPath();c.moveTo(ex-25,ey+2);c.quadraticCurveTo(ex,ey+27,ex+25,ey+2);c.stroke();c.restore();
   }
   c.save();c.translate(0,lift>.8&&active?Math.sin(t*8)*.8:0);path('M180 181 Q200 172 220 181 Q226 188 200 204 Q174 188 180 181 Z');c.restore();
   path(`M200 205 C190 ${232+bliss*3} 139 ${235-bliss*8} 147 ${203-bliss*5}`);path(`M200 205 C213 ${234+bliss*3} 259 ${232-bliss*5} 253 ${204-bliss*5}`);
   c.save();c.globalAlpha=bliss*.15;c.fillStyle='#8ee2cb';for(const cheek of [105,295]){c.beginPath();c.ellipse(cheek,188,18,7,0,0,Math.PI*2);c.fill();}c.restore();
   c.save();c.globalAlpha=1-lift;path('M170 232 Q200 283 231 232');path('M183 251 Q192 242 200 249 Q209 242 219 251');c.restore();
   c.save();c.translate(fx*2,fy*2);
   path('M122 194 Q88 187 58 199');path('M119 207 Q83 206 49 226');path('M121 220 Q91 231 64 257');
   path('M278 194 Q311 187 343 199');path('M281 207 Q320 206 352 226');path('M279 220 Q313 233 336 258');
   c.restore();c.restore();
   // Exactly two flippers hold a letter; no body or additional limbs.
   const mailY=309-lift*97+fy*7;c.save();c.translate(200+fx*24,mailY+40);c.rotate(fx*.085);c.translate(-200,-40);c.lineWidth=3;c.strokeStyle='#8ee2cb';
   path('M120 0 H280 Q287 0 287 7 V75 Q287 82 280 82 H120 Q113 82 113 75 V7 Q113 0 120 0 Z','#103549');path('M116 6 L200 55 L284 6');path('M116 77 L169 37');path('M284 77 L231 37');
   c.strokeStyle='#f5fafc';path('M111 25 C89 21 89 65 110 62 Q125 61 124 48 Q124 31 111 25 Z','#092238');path('M289 25 C311 21 311 65 290 62 Q275 61 276 48 Q276 31 289 25 Z','#092238');c.restore();c.restore();

  }
  disconnectedCallback(){document.removeEventListener('pointerdown',this.unlockAudio);document.removeEventListener('keydown',this.unlockAudio);if(this.audio)void this.audio.close().catch(()=>{});this.riveInstance?.cleanup();this.riveInstance=null;cancelAnimationFrame(this.raf);this.resize?.disconnect();this.observer?.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.motion?.removeEventListener('change',this.onVisibility);document.removeEventListener('pointermove',this.onMove);document.documentElement.removeEventListener('pointerleave',this.onLeave);window.removeEventListener('blur',this.onLeave);}
 }
 customElements.define('seqforge-connection',Connection);
})();
