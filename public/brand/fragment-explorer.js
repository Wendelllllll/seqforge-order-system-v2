(()=>{
  'use strict';
  const section=document.querySelector('[data-fragment-explorer]');
  if(!section)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const colors={FAM:'#008c79',HEX:'#b77f34',ROX:'#786ba8'};
  const channels=Object.keys(colors);
  const modes=[
    {id:'profile',title:'Fragment profile',note:'Inspect individual peaks and fragment sizes.'},
    {id:'overview',title:'Sample overview',note:'Review sample quality and detected fragments.'},
    {id:'range',title:'Size-based analysis',note:'Isolate a size range and compare its signals.'}
  ];
  // Deterministic illustrative records. Every view derives from these same records.
  const samples=Array.from({length:8},(_,i)=>{
    const peaks=Array.from({length:9+i%4},(_,j)=>({
      id:'s'+i+'p'+j,size:112+j*21+(i*7+j*3)%13,
      signal:170+(i*127+j*193)%545,channel:channels[(i+j)%3],review:false
    }));
    return {id:'Sample_'+String(i+1).padStart(2,'0'),status:i===2||i===6?'Review':'Passed',peaks};
  });
  samples[2].peaks=[
    {id:'s2p0',size:142,signal:302,channel:'FAM',review:false},
    {id:'s2p1',size:188,signal:410,channel:'HEX',review:true},
    {id:'s2p2',size:241,signal:628,channel:'FAM',review:false},
    {id:'s2p3',size:318,signal:244,channel:'ROX',review:false}
  ];
  samples[6].peaks[2].review=true;
  const state={mode:'profile',sample:2,channel:'all',view:[100,360],range:[150,300],locked:null,hover:null};
  let chart=null,svg=null,chartWidth=600,chartHeight=340,shownDomain=[100,360],drag=null,zoomFrame=0;
  let transitionTimer=0,entryTimer=0,firstInspect=false,visible=false,lastWidth=0;
  const workspace=section.querySelector('.fx-workspace');
  const mount=section.querySelector('.fx-mount');
  const panel=workspace.querySelector('.fx-panel');
  const view=workspace.querySelector('.fx-view');
  const sampleSelect=workspace.querySelector('[data-fx-sample]');
  const channelSelect=workspace.querySelector('[data-fx-channel]');
  const announce=section.querySelector('.fx-announcement');
  const dialog=document.querySelector('#fx-report');
  workspace.append(announce);
  const mobileTabs=matchMedia('(max-width:760px)');
  const syncTabOrientation=()=>workspace.querySelector('[role="tablist"]').setAttribute('aria-orientation',mobileTabs.matches?'horizontal':'vertical');
  syncTabOrientation();mobileTabs.addEventListener('change',syncTabOrientation);
  let reportOpener=null,oldOverflow='';
  const sample=()=>samples[state.sample];
  const filtered=()=>sample().peaks.filter(p=>state.channel==='all'||p.channel===state.channel);
  const selected=()=>sample().peaks.find(p=>p.id===state.locked);
  const bounds=()=>state.mode==='range'?[100,360]:state.view;
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const inRange=(p,r)=>p.size>=r[0]&&p.size<=r[1];
  const rangeLabel=r=>Math.round(r[0])+'–'+Math.round(r[1])+' bp';
  const say=text=>{announce.textContent=text;};
  const allStats=peaks=>({
    count:peaks.length,
    range:peaks.length?Math.min(...peaks.map(p=>p.size))+'–'+Math.max(...peaks.map(p=>p.size))+' bp':'No fragments',
    strongest:peaks.reduce((a,p)=>!a||p.signal>a.signal?p:a,null)
  });
  sampleSelect.innerHTML=samples.map((s,i)=>'<option value="'+i+'">'+s.id+'</option>').join('');
  sampleSelect.value=String(state.sample);
  const legend=()=>'<div class="fx-legend" aria-label="Dye channels">'+channels.map(c=>'<span><i style="--dye:'+colors[c]+'"></i>'+c+'</span>').join('')+'</div>';
  const chartMarkup=(extra='')=>'<div class="fx-chart '+extra+'" data-fx-chart><svg aria-label="Illustrative fragment electropherogram" role="group"></svg><div class="fx-tooltip" hidden></div></div>';
  const statsMarkup=items=>'<dl class="fx-stats">'+items.map(i=>'<div><dt>'+i[0]+'</dt><dd>'+i[1]+'</dd></div>').join('')+'</dl>';
  function profileHTML(){
    return '<p class="fx-description">Hover over the profile to inspect fragment sizes and signal intensity.</p>'+
      '<div class="fx-chart-tools">'+legend()+'<button class="fx-text-button" data-fx-reset>Reset view</button></div>'+
      chartMarkup()+
      '<div class="fx-inspection"><p class="fx-caption" data-fx-caption></p><aside class="fx-detail" data-fx-detail aria-label="Selected fragment"></aside></div>'+
      '<p class="fx-hint">Hover or tap a peak to inspect. Drag across the plot to zoom.</p>';
  }
  function overviewHTML(){
    const peaks=filtered(),stats=allStats(peaks);
    return '<p class="fx-description">Choose a sample to review its fragment count, size range and quality flags.</p>'+
      '<div class="fx-samples" role="group" aria-label="Illustrative samples">'+samples.map((s,i)=>'<button class="fx-sample" data-fx-pick="'+i+'" aria-pressed="'+(state.sample===i)+'"><strong>'+s.id+'</strong><span data-review="'+(s.status==='Review')+'">'+s.status+'</span></button>').join('')+'</div>'+
      '<div class="fx-summary-title"><strong>'+sample().id+'</strong><span>'+ (state.channel==='all'?'All channels':state.channel+' channel')+'</span></div>'+
      statsMarkup([['Detected fragments',stats.count],['Size range',stats.range],['Quality status',sample().status==='Review'?'Review recommended':'Passed']])+
      chartMarkup('fx-mini')+
      '<p class="fx-quality-note">'+(sample().status==='Review'?'One peak is flagged for manual review in this illustrative sample.':'No manual-review flags in this illustrative sample.')+'</p>'+
      '<button class="fx-text-button" data-fx-inspect>Inspect '+sample().id+' in the profile →</button>';
  }
  function rangeStats(){
    const peaks=filtered().filter(p=>inRange(p,state.range)),stats=allStats(peaks);
    return statsMarkup([['Selected range',rangeLabel(state.range)],['Fragments detected',stats.count],['Strongest peak',stats.strongest?stats.strongest.size+' bp':'None']]);
  }
  function rangeHTML(){
    return '<p class="fx-description">Move the range handles to isolate fragments. Counts update for the selected sample and channel.</p>'+
      '<div class="fx-range-controls"><label for="fx-range-start">Range start <output id="fx-start-value">'+state.range[0]+' bp</output></label>'+
      '<label for="fx-range-end">Range end <output id="fx-end-value">'+state.range[1]+' bp</output></label>'+
      '<div class="fx-dual-range" style="--start:'+((state.range[0]-100)/260*100)+'%;--end:'+((state.range[1]-100)/260*100)+'%">'+
      '<input id="fx-range-start" type="range" aria-label="Range start in base pairs" min="100" max="360" value="'+state.range[0]+'" data-fx-range="0">'+
      '<input id="fx-range-end" type="range" aria-label="Range end in base pairs" min="100" max="360" value="'+state.range[1]+'" data-fx-range="1"></div></div>'+
      '<div data-fx-range-stats>'+rangeStats()+'</div>'+chartMarkup('fx-range-chart')+
      '<p class="fx-caption" data-fx-range-note></p>'+legend();
  }
  function renderView(animate=false){
    cancelAnimationFrame(zoomFrame);drag=null;state.hover=null;
    view.innerHTML=state.mode==='profile'?profileHTML():state.mode==='overview'?overviewHTML():rangeHTML();
    panel.setAttribute('aria-labelledby','fx-tab-'+state.mode);
    workspace.querySelector('[data-fx-domain]').textContent=rangeLabel(state.mode==='range'?state.range:state.mode==='overview'?[100,360]:state.view);
    bindChart();drawChart(animate);
    if(state.mode==='profile')updateInspection();
    if(state.mode==='range')updateRangeNote();
    if(animate&&state.mode==='profile'&&visible)scheduleHint();
  }
  function switchMode(mode,focus=false){
    if(!modes.some(m=>m.id===mode)||state.mode===mode)return;
    clearTimeout(transitionTimer);
    workspace.querySelectorAll('[data-fx-tab]').forEach(b=>{
      const active=b.dataset.fxTab===mode;
      b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;
      b.querySelector('.fx-tab-arrow').textContent=active?'→':'↗';
    });
    if(focus)workspace.querySelector('[data-fx-tab="'+mode+'"]').focus();
    const finish=()=>{
      state.mode=mode;renderView(true);view.classList.remove('is-leaving');view.classList.add('is-entering');
      transitionTimer=setTimeout(()=>view.classList.remove('is-entering'),150);
      say(modes.find(m=>m.id===mode).title+' for '+sample().id);
    };
    if(window.SeqForgeParticles&&!reduced.matches){
      window.SeqForgeParticles.run(panel,view,()=>{state.mode=mode;view.classList.remove("is-leaving","is-entering");renderView(false);say(modes.find(m=>m.id===mode).title+" for "+sample().id);},()=>view);return;
    }
    if(reduced.matches){finish();return;}
    view.classList.remove('is-entering');view.classList.add('is-leaving');
    transitionTimer=setTimeout(finish,120);
  }
  function changeSample(index,restoreCard=false){
    if(!Number.isInteger(index)||index<0||index>=samples.length)return;
    state.sample=index;state.locked=null;state.hover=null;state.view=[100,360];
    sampleSelect.value=String(index);renderView(true);
    if(restoreCard)view.querySelector('[data-fx-pick="'+index+'"]')?.focus();
    say(sample().id+', '+sample().status+', '+filtered().length+' fragments in the selected channels.');
  }
  function bindChart(){
    chart=view.querySelector('[data-fx-chart]');svg=chart.querySelector('svg');
    svg.addEventListener('pointerdown',onDown);
    svg.addEventListener('pointermove',onMove);
    svg.addEventListener('pointerup',onUp);
    svg.addEventListener('pointercancel',cancelDrag);
    svg.addEventListener('pointerleave',()=>{if(!drag){state.hover=null;updateHighlight();}});
    svg.addEventListener('focusin',e=>{if(e.target.dataset.peak){state.hover=e.target.dataset.peak;updateHighlight();}});
    svg.addEventListener('focusout',()=>{state.hover=null;updateHighlight();});
    svg.addEventListener('keydown',e=>{
      const id=e.target.dataset.peak;
      if(!id)return;
      if(e.key==='Enter'||e.key===' '){e.preventDefault();lockPeak(id);}
      if(e.key==='Escape'&&!dialog.open){e.preventDefault();state.locked=null;updateInspection();updateHighlight();}
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
        e.preventDefault();const paths=[...svg.querySelectorAll('[data-peak]')],i=paths.indexOf(e.target);
        paths[(i+(e.key==='ArrowRight'?1:-1)+paths.length)%paths.length]?.focus();
      }
    });
  }
  function geometry(){
    chartWidth=Math.max(300,Math.round(chart.getBoundingClientRect().width));
    chartHeight=Math.round(chart.getBoundingClientRect().height)||340;
    return {left:44,right:chartWidth-14,top:26,bottom:chartHeight-47};
  }
  function drawChart(animate=false,domainOverride=null){
    if(!chart)return;
    const g=geometry();
    shownDomain=domainOverride||(state.mode==='overview'?[100,360]:bounds());
    const x=n=>g.left+(n-shownDomain[0])/(shownDomain[1]-shownDomain[0])*(g.right-g.left);
    const y=n=>g.bottom-n/800*(g.bottom-g.top);
    const count=chartWidth<470?4:6;
    let axes='<g class="fx-axes">';
    for(let i=0;i<=4;i++){
      const v=i*200,yy=y(v);
      axes+='<line x1="'+g.left+'" x2="'+g.right+'" y1="'+yy+'" y2="'+yy+'" stroke="#e1e8dd"/><text class="fx-axis-label" x="'+(g.left-9)+'" y="'+(yy+4)+'" text-anchor="end">'+v+'</text>';
    }
    const targetStep=(shownDomain[1]-shownDomain[0])/count;
    const magnitude=Math.pow(10,Math.floor(Math.log10(targetStep)));
    const step=([1,2,5,10].find(n=>n*magnitude>=targetStep)||10)*magnitude;
    for(let v=Math.ceil(shownDomain[0]/step)*step;v<=shownDomain[1];v+=step){
      const xx=x(v);
      axes+='<text class="fx-axis-label" data-fx-tick="'+v+'" x="'+xx+'" y="'+(g.bottom+22)+'" text-anchor="middle">'+Math.round(v)+'</text>';
    }
    axes+='<text class="fx-axis-label" x="'+g.left+'" y="13">RFU</text><text class="fx-axis-label" x="'+g.right+'" y="'+(chartHeight-5)+'" text-anchor="end">Fragment size · bp</text></g>';
    const rangeShade=state.mode==='range'?'<rect x="'+x(state.range[0])+'" y="'+g.top+'" width="'+(x(state.range[1])-x(state.range[0]))+'" height="'+(g.bottom-g.top)+'" fill="#dcece1" opacity=".6"/>':'';
    const visiblePeaks=filtered().filter(p=>inRange(p,shownDomain));
    const paths=visiblePeaks.map(p=>{
      let d='';
      for(let j=-18;j<=18;j++){
        const size=p.size+j*.4,value=p.signal*Math.exp(-.5*Math.pow((size-p.size)/1.55,2));
        d+=(j===-18?'M':'L')+x(size).toFixed(2)+' '+y(value).toFixed(2);
      }
      const outside=state.mode==='range'&&!inRange(p,state.range),interactive=state.mode==='profile';
      return '<path class="fx-peak" data-peak="'+p.id+'" d="'+d+'" fill="none" stroke="'+(outside?'#c5cec4':colors[p.channel])+'" stroke-width="1.8" stroke-linecap="round"'+(interactive?' tabindex="0" role="button" aria-label="'+p.size+' bp, '+p.signal+' RFU, '+p.channel+', '+sample().id+'. Select fragment."':'')+'/>';
    }).join('');
    const empty=visiblePeaks.length?'':'<text x="'+((g.left+g.right)/2)+'" y="'+((g.top+g.bottom)/2)+'" text-anchor="middle" fill="#617869" font-size="14">No fragments in this view</text>';
    svg.setAttribute('viewBox','0 0 '+chartWidth+' '+chartHeight);
    svg.innerHTML='<defs><clipPath id="fx-plot-clip"><rect x="'+g.left+'" y="'+(g.top-5)+'" width="'+(g.right-g.left)+'" height="'+(g.bottom-g.top+6)+'"/></clipPath></defs>'+rangeShade+axes+
      '<g clip-path="url(#fx-plot-clip)"><g class="fx-traces">'+paths+'</g><rect data-fx-brush hidden fill="#007d6e18" stroke="#007d6e" y="'+g.top+'" height="'+(g.bottom-g.top)+'"/></g>'+empty+
      '<g data-fx-crosshair visibility="hidden" pointer-events="none"><line stroke="#496f5a" stroke-dasharray="3 4" y1="'+g.top+'" y2="'+g.bottom+'"/><rect y="'+(g.bottom+7)+'" width="54" height="24" rx="3" fill="#007d6e"/><text y="'+(g.bottom+24)+'" text-anchor="middle" fill="white" font-size="13"></text></g>';
    if(animate&&visible&&!reduced.matches){chart.classList.remove('is-drawing');void chart.offsetWidth;chart.classList.add('is-drawing');}
    updateHighlight();
    const reset=view.querySelector('[data-fx-reset]');if(reset)reset.disabled=state.view[0]===100&&state.view[1]===360;
  }
  function pointerPosition(e){
    const r=svg.getBoundingClientRect(),g=geometry();
    const px=(e.clientX-r.left)/r.width*chartWidth;
    return {x:clamp(px,g.left,g.right),y:(e.clientY-r.top)/r.height*chartHeight,g};
  }
  function sizeAt(px){const g=geometry();return shownDomain[0]+(px-g.left)/(g.right-g.left)*(shownDomain[1]-shownDomain[0]);}
  function nearest(px){
    const g=geometry();
    return filtered().filter(p=>inRange(p,shownDomain)).map(p=>({p,d:Math.abs(g.left+(p.size-shownDomain[0])/(shownDomain[1]-shownDomain[0])*(g.right-g.left)-px)})).sort((a,b)=>a.d-b.d).find(x=>x.d<22)?.p;
  }
  function onDown(e){
    if(state.mode!=='profile'||e.button!==0)return;
    const pos=pointerPosition(e);if(pos.y<pos.g.top||pos.y>pos.g.bottom)return;
    drag={id:e.pointerId,start:pos.x,end:pos.x};svg.setPointerCapture(e.pointerId);
  }
  function onMove(e){
    if(state.mode!=='profile')return;
    const pos=pointerPosition(e);
    if(drag){
      drag.end=pos.x;
      if(Math.abs(drag.end-drag.start)>7){
        const b=svg.querySelector('[data-fx-brush]');b.removeAttribute('hidden');
        b.setAttribute('x',Math.min(drag.start,drag.end));b.setAttribute('width',Math.abs(drag.end-drag.start));
        view.querySelector('[data-fx-caption]').textContent='Zoom to '+rangeLabel([sizeAt(Math.min(drag.start,drag.end)),sizeAt(Math.max(drag.start,drag.end))])+'. Release to inspect this interval.';
      }
      return;
    }
    const p=pos.y>=pos.g.top&&pos.y<=pos.g.bottom?nearest(pos.x):null;
    state.hover=p?.id||null;updateHighlight();
    if(p&&!firstInspect){firstInspect=true;view.querySelector('.fx-hint')?.classList.add('is-dismissed');}
  }
  function onUp(e){
    if(!drag)return;
    const current=drag;drag=null;
    if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    svg.querySelector('[data-fx-brush]')?.setAttribute('hidden','');
    if(Math.abs(current.end-current.start)>12){
      let a=Math.round(sizeAt(Math.min(current.start,current.end))),b=Math.round(sizeAt(Math.max(current.start,current.end)));
      if(b-a<12){const mid=(a+b)/2;a=Math.max(100,Math.floor(mid-6));b=Math.min(360,a+12);}
      zoomTo([a,b]);
    }else{const p=nearest(current.end);if(p)lockPeak(p.id);else updateInspection();}
  }
  function cancelDrag(){drag=null;svg?.querySelector('[data-fx-brush]')?.setAttribute('hidden','');updateInspection();}
  function zoomTo(domain){
    const from=shownDomain.slice();state.view=domain;state.hover=null;
    if(selected()&&!inRange(selected(),domain))state.locked=null;
    workspace.querySelector('[data-fx-domain]').textContent=rangeLabel(domain);
    cancelAnimationFrame(zoomFrame);
    const started=performance.now();
    function tick(t){
      const progress=reduced.matches?1:Math.min(1,(t-started)/250);
      drawChart(false,[from[0]+(domain[0]-from[0])*progress,from[1]+(domain[1]-from[1])*progress]);
      if(progress<1)zoomFrame=requestAnimationFrame(tick);else updateInspection();
    }
    zoomFrame=requestAnimationFrame(tick);say('Profile view: '+rangeLabel(domain));
  }
  function lockPeak(id){
    state.locked=state.locked===id?null:id;state.hover=null;updateHighlight();updateInspection();
    const p=selected();say(p?'Selected fragment, '+p.size+' bp, '+p.signal+' RFU, '+p.channel+', '+sample().id:'Fragment selection cleared.');
  }
  function updateHighlight(){
    if(!svg)return;
    const p=sample().peaks.find(p=>p.id===(state.locked||state.hover));
    svg.querySelectorAll('[data-peak]').forEach(path=>{
      const active=p&&path.dataset.peak===p.id;
      path.setAttribute('opacity',state.mode==='profile'&&p&&!active?'.28':'1');
      path.setAttribute('stroke-width',active?'3':'1.8');
      if(path.hasAttribute('aria-label'))path.setAttribute('aria-pressed',String(path.dataset.peak===state.locked));
    });
    const marker=svg.querySelector('[data-fx-crosshair]'),tip=chart.querySelector('.fx-tooltip');
    svg.querySelectorAll('[data-fx-tick]').forEach(t=>t.setAttribute('visibility','visible'));
    if(!p||state.mode!=='profile'||!inRange(p,shownDomain)){marker.setAttribute('visibility','hidden');tip.hidden=true;if(state.mode==='profile')updateInspection();return;}
    const g=geometry(),xx=g.left+(p.size-shownDomain[0])/(shownDomain[1]-shownDomain[0])*(g.right-g.left);
    svg.querySelectorAll('[data-fx-tick]').forEach(t=>{if(Math.abs(Number(t.getAttribute('x'))-xx)<37)t.setAttribute('visibility','hidden');});
    marker.setAttribute('visibility','visible');
    marker.querySelector('line').setAttribute('x1',xx);marker.querySelector('line').setAttribute('x2',xx);
    marker.querySelector('rect').setAttribute('x',clamp(xx-27,0,chartWidth-54));
    marker.querySelector('text').setAttribute('x',clamp(xx,27,chartWidth-27));marker.querySelector('text').textContent=p.size;
    tip.hidden=!!state.locked;
    if(!state.locked){
      tip.innerHTML='<dl><dt>Fragment size</dt><dd>'+p.size+' bp</dd><dt>Signal</dt><dd>'+p.signal+' RFU</dd><dt>Channel</dt><dd>'+p.channel+'</dd><dt>Sample</dt><dd>'+sample().id+'</dd></dl>';
      tip.style.left=clamp(xx+(xx>chartWidth/2?-204:14),0,chartWidth-190)+'px';tip.style.top='8px';
    }
    updateInspection(p);
  }
  function updateInspection(hoverPeak=null){
    if(state.mode!=='profile')return;
    const caption=view.querySelector('[data-fx-caption]'),detail=view.querySelector('[data-fx-detail]');
    if(!caption||!detail)return;
    const p=selected()||hoverPeak;
    caption.textContent=p?sample().id+' · '+p.channel+' · '+p.size+' bp · '+p.signal+' RFU. '+(p.review?'Flagged for manual review in this example.':'A resolved fragment signal in this illustrative profile.'):
      filtered().filter(p=>inRange(p,state.view)).length+' fragments shown for '+sample().id+'. Select a peak to keep its details in view.';
    const locked=selected();detail.classList.toggle('is-locked',!!locked);
    detail.innerHTML=locked?'<button class="fx-unlock" data-fx-unlock aria-label="Clear selected fragment">×</button><span class="fx-detail-kicker">Selected fragment</span><strong>'+locked.size+' bp</strong><span class="fx-detail-copy">'+sample().id+'<br>'+locked.signal+' RFU · '+locked.channel+'<br>'+(locked.review?'Review recommended':'High-confidence peak')+'<br>Within selected view</span>':
      '<span class="fx-detail-kicker">Take a closer look</span><span class="fx-detail-copy">Click a peak to lock its size, signal and channel here.</span>';
  }
  function updateRangeNote(){
    const peaks=filtered().filter(p=>inRange(p,state.range));
    view.querySelector('[data-fx-range-note]').textContent=peaks.length?peaks.length+' fragments within '+rangeLabel(state.range)+'. Outside fragments are shown in gray.':'No fragments match this range and channel. Widen the range or choose another channel.';
  }
  function updateRange(input){
    const i=Number(input.dataset.fxRange),n=Number(input.value);if(!Number.isFinite(n))return;
    state.range[i]=i===0?clamp(n,100,state.range[1]-1):clamp(n,state.range[0]+1,360);
    input.value=String(state.range[i]);
    view.querySelector('#fx-start-value').textContent=state.range[0]+' bp';view.querySelector('#fx-end-value').textContent=state.range[1]+' bp';
    view.querySelectorAll('[data-fx-range]').forEach((el,j)=>el.setAttribute('aria-valuetext',state.range[j]+' base pairs'));
    const track=view.querySelector('.fx-dual-range');
    track.style.setProperty('--start',(state.range[0]-100)/260*100+'%');track.style.setProperty('--end',(state.range[1]-100)/260*100+'%');
    view.querySelector('[data-fx-range-stats]').innerHTML=rangeStats();
    workspace.querySelector('[data-fx-domain]').textContent=rangeLabel(state.range);
    drawChart();updateRangeNote();
  }
  function scheduleHint(){
    clearTimeout(entryTimer);
    entryTimer=setTimeout(()=>view.querySelector('.fx-hint')?.classList.add('is-dismissed'),7000);
  }
  workspace.addEventListener('click',e=>{
    const tab=e.target.closest('[data-fx-tab]');if(tab){switchMode(tab.dataset.fxTab);return;}
    const pick=e.target.closest('[data-fx-pick]');if(pick){changeSample(Number(pick.dataset.fxPick),true);return;}
    if(e.target.closest('[data-fx-reset]'))zoomTo([100,360]);
    if(e.target.closest('[data-fx-unlock]')){state.locked=null;state.hover=null;updateHighlight();updateInspection();say('Fragment selection cleared.');}
    if(e.target.closest('[data-fx-inspect]'))switchMode('profile',true);
    if(e.target.closest('[data-fx-report]'))openReport(e.target.closest('[data-fx-report]'));
  });
  workspace.addEventListener('keydown',e=>{
    const tab=e.target.closest('[data-fx-tab]');if(!tab)return;
    let index=modes.findIndex(m=>m.id===tab.dataset.fxTab);
    if(['ArrowDown','ArrowRight'].includes(e.key))index=(index+1)%3;
    else if(['ArrowUp','ArrowLeft'].includes(e.key))index=(index+2)%3;
    else if(e.key==='Home')index=0;else if(e.key==='End')index=2;else return;
    e.preventDefault();switchMode(modes[index].id,true);
  });
  sampleSelect.addEventListener('change',()=>changeSample(Number(sampleSelect.value)));
  channelSelect.addEventListener('change',()=>{
    state.channel=channels.includes(channelSelect.value)?channelSelect.value:'all';state.locked=null;state.hover=null;renderView(true);
    say((state.channel==='all'?'All channels':state.channel)+' selected. '+filtered().length+' fragments.');
  });
  view.addEventListener('input',e=>{if(e.target.matches('[data-fx-range]'))updateRange(e.target);});
  view.addEventListener('change',e=>{if(e.target.matches('[data-fx-range]'))say(rangeLabel(state.range)+', '+filtered().filter(p=>inRange(p,state.range)).length+' fragments.');});
  function openReport(opener){
    reportOpener=opener;mount.style.minHeight=workspace.getBoundingClientRect().height+'px';
    dialog.querySelector('.fx-report-body').append(workspace);oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.showModal();dialog.querySelector('.fx-report-close').focus();requestAnimationFrame(()=>drawChart(false));
  }
  dialog.querySelector('.fx-report-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    mount.append(workspace);mount.style.minHeight='';document.body.style.overflow=oldOverflow;
    requestAnimationFrame(()=>{drawChart(false);reportOpener?.focus({preventScroll:true});});
  });
  if('ResizeObserver' in window)new ResizeObserver(entries=>{
    const width=entries[0].contentRect.width;
    if(Math.abs(width-lastWidth)>1){lastWidth=width;drawChart(false);}
  }).observe(panel);
  renderView(false);
  if('IntersectionObserver' in window){
    section.classList.add('fx-ready');
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)){visible=true;section.classList.add('is-visible');drawChart(true);scheduleHint();observer.disconnect();}
    },{threshold:.12});observer.observe(section);
  }else{visible=true;section.classList.add('is-visible');}
})();
