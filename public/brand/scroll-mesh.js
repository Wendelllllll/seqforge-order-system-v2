(() => {
  'use strict';
  const sections=[...document.querySelectorAll('.seal-chapter,.sample-journey,.lab-ending,.service-cover,.service-compare,.prep-section,.utility-page .page-hero,.utility-page .login-intro')];
  if(!sections.length)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:760px)');
  const vertex='attribute vec2 a;varying vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  const fragment=`precision mediump float;
    varying vec2 uv;uniform float progress;uniform float aspect;uniform float dark;
    float field(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/r;return exp(-dot(d,d)*2.0);}
    void main(){
      vec2 p=vec2(uv.x,1.0-uv.y);float t=progress*3.14159;
      vec2 warp=p+vec2(sin(p.y*5.0+t)*.13,cos(p.x*4.0-t)*.10);
      float mint=field(warp,vec2(.86-.12*sin(t),.28+.35*progress),vec2(.46,.65));
      float teal=field(warp,vec2(.10+.14*cos(t),.80-.45*progress),vec2(.38,.58));
      float blue=field(warp,vec2(1.02,.85-.45*sin(t)),vec2(.32,.56));
      vec3 color=(vec3(.54,.82,.73)*mint+vec3(.0,.66,.61)*teal+vec3(.07,.19,.36)*blue)/(mint+teal+blue+.0001);
      float edge=smoothstep(.08,.47,abs(p.x-.48));
      float envelope=smoothstep(0.,.16,p.y)*(1.-smoothstep(.83,1.,p.y));
      float strength=clamp(mint+teal+blue,0.,1.0)*mix(.09,.38,edge);
      float curve=p.y+.09*sin(p.x*5.+t)-progress*.18;
      float line=1.-smoothstep(.001,.003,abs(fract(curve*5.)-.5));
      strength+=line*.022*edge;
      float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
      color+=grain*.018;
      gl_FragColor=vec4(color,envelope*strength*mix(1.,1.55,dark));
    }`;
  let raf=0,last=0,lastDraw=0,measureFrame=0;
  const items=sections.map(element=>{
    element.classList.add('sf-mesh-surface');
    const dark=element.matches('.lab-ending');if(dark)element.classList.add('sf-mesh-dark');
    return {element,dark,visible:false,current:.5,target:.5,gl:null,canvas:null,failed:false,top:0,width:1,height:1};
  });
  function init(item){
    if(item.gl||item.failed||mobile.matches||reduced.matches)return;
    const canvas=document.createElement('canvas');canvas.className='sf-mesh-canvas';canvas.setAttribute('aria-hidden','true');
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,powerPreference:'low-power'});
    if(!gl){item.failed=true;return;}
    try{
      const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Mesh shader unavailable');return shader;};
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Mesh renderer unavailable');
      gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const a=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
      item.uniform=gl.getUniformLocation(program,'progress');item.darkUniform=gl.getUniformLocation(program,'dark');
      item.gl=gl;item.canvas=canvas;
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();item.failed=true;item.gl=null;item.element.classList.remove('sf-mesh-ready');canvas.remove();});
      item.element.prepend(canvas);item.element.classList.add('sf-mesh-ready');
      wake();
    }catch{item.failed=true;gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }
  function draw(item){
    const {gl,canvas}=item;if(!gl)return;
    const scale=Math.min(1,640/item.width,480/item.height);
    const w=Math.max(1,Math.round(item.width*scale)),h=Math.max(1,Math.round(item.height*scale));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    gl.uniform1f(item.uniform,item.current);gl.uniform1f(item.darkUniform,item.dark?1:0);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function frame(now){
    raf=0;if(document.hidden||mobile.matches||reduced.matches)return;
    if(now-lastDraw<32){raf=requestAnimationFrame(frame);return;}lastDraw=now;
    const blend=1-Math.exp(-Math.min(50,now-last||16)/105);last=now;
    let settling=false;
    for(const item of items){
      if(!item.visible)continue;
      item.target=Math.max(0,Math.min(1,(innerHeight+scrollY-item.top)/(innerHeight+item.height)));
      item.current+=(item.target-item.current)*blend;
      if(Math.abs(item.target-item.current)>.0008)settling=true;
      draw(item);
    }
    if(settling)raf=requestAnimationFrame(frame);
  }
  const wake=()=>{if(!raf&&!document.hidden&&!mobile.matches&&!reduced.matches)raf=requestAnimationFrame(frame);};
  const measure=()=>{measureFrame=0;items.forEach(item=>{const r=item.element.getBoundingClientRect();item.top=r.top+scrollY;item.width=r.width;item.height=r.height;});wake();};
  const requestMeasure=()=>{if(!measureFrame)measureFrame=requestAnimationFrame(measure);};
  // Compile during idle time, rather than at the moment a section enters view.
  const warm=()=>{if(mobile.matches||reduced.matches)return;let index=0;const next=()=>{if(index>=items.length)return;const item=items[index++];init(item);if('requestIdleCallback' in window)requestIdleCallback(next);else setTimeout(next,160);};if('requestIdleCallback' in window)requestIdleCallback(next);else setTimeout(next,160);};
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){const item=items.find(i=>i.element===entry.target);item.visible=entry.isIntersecting;}wake();},{rootMargin:'100px 0px'});
    items.forEach(i=>observer.observe(i.element));
  }else items.forEach(i=>i.visible=true);
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(requestMeasure):null;
  items.forEach(i=>resize?.observe(i.element));
  resize?.observe(document.body);
  addEventListener('scroll',wake,{passive:true});addEventListener('resize',requestMeasure,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();});
  reduced.addEventListener('change',()=>{warm();requestMeasure();});mobile.addEventListener('change',()=>{warm();requestMeasure();});
  document.fonts?.ready.then(requestMeasure);measure();warm();
})();
