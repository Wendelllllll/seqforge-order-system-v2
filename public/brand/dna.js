/* Fullscreen WebGL refraction. Pointer impulses become damped radial wave normals;
   only the image texture is displaced. The HTML interface remains independent. */
(() => {
  const hero=document.querySelector('.dna-hero'),canvas=document.querySelector('#ripple-canvas');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),desktop=matchMedia('(min-width:761px) and (pointer:fine)');
  let paused=document.body.classList.contains('motion-paused'),visible=true,loaded=false,lost=false,raf=0,gl,program,texture,uniforms;
  const waves=new Float32Array(48);for(let i=0;i<12;i++)waves[i*4+2]=-100;
  let cursor=0,lastImpulse=0,lastX=-1,lastY=-1,activeUntil=0,imageRatio=16/9;
  const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const fragment=`precision highp float;
    varying vec2 uv;uniform sampler2D scene;uniform vec2 resolution;uniform float imageRatio;uniform float time;uniform vec4 waves[12];
    void main(){float aspect=resolution.x/resolution.y;vec2 normal=vec2(0.);float light=0.;
      for(int i=0;i<12;i++){float age=time-waves[i].z;if(age>=0.&&age<4.5){
        vec2 delta=(uv-waves[i].xy)*vec2(aspect,1.);float dist=length(delta);float radius=age*.19;
        float band=exp(-pow((dist-radius)/.085,2.));float decay=exp(-age*1.35)*(1.-smoothstep(3.3,4.5,age));
        float wave=sin((dist-radius)*68.)*band*decay*waves[i].w;
        normal+=delta/max(dist,.008)*wave*.0085;light+=wave*.022;
      }}
      vec2 fit=aspect>imageRatio?vec2(1.,imageRatio/aspect):vec2(aspect/imageRatio,1.);
      vec2 sampleUV=(uv-.5+normal/vec2(aspect,1.))*fit+.5;
      vec3 color=texture2D(scene,clamp(sampleUV,.001,.999)).rgb;
      gl_FragColor=vec4(color+light*vec3(.35,.8,.7),1.);
    }`;
  function eligible(){return desktop.matches&&!reduced.matches&&!paused&&!lost}
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return s}
  function resize(){if(!gl||lost)return;const r=hero.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,1.5,1920/r.width);canvas.width=Math.round(r.width*scale);canvas.height=Math.round(r.height*scale);gl.viewport(0,0,canvas.width,canvas.height);if(loaded)draw(performance.now())}
  function draw(t){if(!loaded||lost)return;gl.useProgram(program);gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform1f(uniforms.imageRatio,imageRatio);gl.uniform1f(uniforms.time,t/1000);gl.uniform4fv(uniforms.waves,waves);gl.drawArrays(gl.TRIANGLES,0,3)}
  function animate(t){raf=0;if(!eligible()||!visible||document.hidden)return;draw(t);if(t<activeUntil)raf=requestAnimationFrame(animate)}
  function request(){if(!raf&&loaded&&eligible()&&visible&&!document.hidden)raf=requestAnimationFrame(animate)}
  function initialize(){if(gl||!desktop.matches||reduced.matches)return;
    try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});if(!gl)return;
      const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.bindAttribLocation(program,0,'position');gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Ripple shader unavailable');gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      uniforms={};for(const name of ['resolution','imageRatio','time','waves'])uniforms[name]=gl.getUniformLocation(program,name==='waves'?'waves[0]':name);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const image=new Image();image.onload=()=>{if(lost)return;imageRatio=image.width/image.height;gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);loaded=true;resize();sync()};image.src='/brand/assets/dna-hero.png';
    }catch(error){canvas.classList.remove('ready');console.warn('Static hero fallback:',error.message)}
  }
  function sync(){initialize();cancelAnimationFrame(raf);raf=0;for(let i=0;i<12;i++)waves[i*4+2]=-100;canvas.classList.toggle('ready',loaded&&eligible());if(loaded&&eligible())draw(performance.now())}
  hero.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||!eligible()||!loaded)return;const now=performance.now(),r=hero.getBoundingClientRect();const x=(e.clientX-r.left)/r.width,y=1-(e.clientY-r.top)/r.height;const distance=Math.hypot(x-lastX,y-lastY);if(now-lastImpulse<45||distance<.002)return;
    waves.set([x,y,now/1000,Math.min(.85,.3+distance*9)],cursor*4);cursor=(cursor+1)%12;lastX=x;lastY=y;lastImpulse=now;activeUntil=now+4500;request();
  },{passive:true});
  hero.addEventListener('pointerleave',()=>{lastX=lastY=-1});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else{cancelAnimationFrame(raf);raf=0}},{threshold:0}).observe(hero);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;cancelAnimationFrame(raf);raf=0;canvas.classList.remove('ready')});
  canvas.addEventListener('webglcontextrestored',()=>{gl=null;loaded=false;lost=false;initialize()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0}else request()});
  document.addEventListener('seqforge-motion',e=>{paused=e.detail.paused;sync();updateScroll()});desktop.addEventListener('change',sync);reduced.addEventListener('change',sync);window.addEventListener('resize',resize,{passive:true});
  // Native scroll drives a pinned scene that gently recedes into a white frame.
  const track=document.querySelector('.hero-scroll-track'),pin=document.querySelector('.hero-scroll-pin'),header=document.querySelector('header');
  let scrollFrame=0,current=0,target=0,lastScrollTime=0;
  function paintFrame(){const p=current*current*(3-2*current),small=matchMedia('(max-width:760px)').matches;
    hero.style.setProperty('--frame-scale',(1-p*(small?.12:.18)).toFixed(5));
    hero.style.setProperty('--frame-y',(p*(small?40:36)).toFixed(2)+'px');
    hero.style.setProperty('--frame-radius',(p*(small?22:28)).toFixed(2)+'px');
    hero.style.setProperty('--frame-shadow',(p*.08).toFixed(3));
    const light=paused||reduced.matches?(scrollY>hero.offsetHeight*.7?1:0):Math.min(1,p*1.35);
    header.style.setProperty('--frame-light',light.toFixed(3));header.style.setProperty('--frame-ink',light>.35?'1':'0');header.classList.toggle('header-on-light',light>.72);
  }
  function easeScroll(t){scrollFrame=0;const dt=Math.min(48,t-lastScrollTime||16);lastScrollTime=t;current+=(target-current)*(1-Math.exp(-dt/135));if(Math.abs(target-current)<.001)current=target;paintFrame();if(current!==target)scrollFrame=requestAnimationFrame(easeScroll)}
  function updateScroll(){const distance=Math.max(1,track.offsetHeight-pin.offsetHeight),top=track.getBoundingClientRect().top;
    target=paused||reduced.matches?0:Math.min(1,Math.max(0,-top/distance));
    if(paused||reduced.matches){cancelAnimationFrame(scrollFrame);scrollFrame=0;current=0;paintFrame()}else if(!scrollFrame)scrollFrame=requestAnimationFrame(easeScroll);
  }
  window.addEventListener('scroll',updateScroll,{passive:true});window.addEventListener('resize',updateScroll,{passive:true});reduced.addEventListener('change',updateScroll);
  const reveal=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');reveal.unobserve(e.target)}}),{threshold:.12});
  document.querySelectorAll('.lab-introduction>*,.pricing-intro,.pricing-console,.journey-heading,.journey-machine,.lab-help>*,.lab-ending>h2').forEach(el=>{el.classList.add('scroll-reveal');reveal.observe(el)});
  sync();updateScroll();
})();
