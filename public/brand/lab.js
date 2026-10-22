(() => {
  const motionButton=document.querySelector('.scene-motion'),motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=motionMedia.matches;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearJourney()});
  const priceData={
    sanger:[
      {name:'Standard',description:'DNA and primer supplied separately',keys:['sanger-standard-tubes','sanger-standard-plate'],type:'standard'},
      {name:'Pre-mixed',description:'DNA and primer mixed in each sample',keys:['sanger-premixed-tubes','sanger-premixed-plate'],type:'pre-mixed'}
    ],
    nanopore:[
      {name:'Whole plasmid ≤12 kb',description:'Up to 12,000 bp, including 12 kb',keys:['plasmid-tubes','plasmid-plate']},
      {name:'Whole plasmid >12 kb',description:'Larger than 12,000 bp',keys:['plasmid-large-tubes','plasmid-large-plate']}
    ]
  };
  let pricingService='sanger',pricingFormat='Standard',rates=null,priceUnavailable=false;
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  function updatePriceSelection(){
    const option=priceData[pricingService].find(row=>row.name===pricingFormat);
    document.querySelector('#price-selection').textContent=(pricingService==='sanger'?'Sanger':'Whole Plasmid')+' / '+(option.type?option.name:option.name.replace('Whole plasmid ',''));
    document.querySelector('#price-unit').textContent=pricingService==='sanger'?'USD / reaction':'USD / sample';
    document.querySelector('#quote-link').href=pricingService==='sanger'?'/orders/new?service=sanger&type='+option.type:'/orders/new?service=whole-plasmid';
    document.querySelector('#price-status').textContent=priceUnavailable?'Prices are temporarily unavailable. Please reload or check the order form.':!rates?'Loading current prices…':pricingService==='sanger'?'Current sequencing rates. Each primer reaction is charged separately. Taxes, shipping and additional services are excluded.':'Current rates for purified plasmid DNA. Enter the expected size when ordering; unknown sizes need lab confirmation. Taxes, shipping and additional services are excluded.';
  }
  function activatePrice(service,keepSelection=false){
    pricingService=service;
    if(!keepSelection)pricingFormat=priceData[service][0].name;
    const options=document.querySelector('#price-options');options.replaceChildren();
    priceData[service].forEach(({name,description,keys})=>{
      const selected=name===pricingFormat,b=document.createElement('button');b.type='button';b.className='price-row'+(selected?' selected':'');b.dataset.format=name;b.setAttribute('aria-pressed',String(selected));
      const span=document.createElement('span');span.append(document.createTextNode(name));const small=document.createElement('small');small.textContent=description;span.append(small);
      const price=document.createElement('b');
      if(rates){price.append(document.createTextNode(money.format(rates[keys[0]]/100)+' tubes'));const plate=document.createElement('small');plate.textContent=money.format(rates[keys[1]]/100)+' plate';price.append(plate)}
      else price.textContent=priceUnavailable?'Unavailable':'Loading…';
      b.append(span,price);options.append(b);
    });
    document.querySelectorAll('[data-price]').forEach(b=>{const active=b.dataset.price===service;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});document.querySelector('#price-panel').setAttribute('aria-labelledby',service==='sanger'?'price-tab-sanger':'price-tab-nano');updatePriceSelection();
  }
  document.querySelectorAll('[data-price]').forEach((b,i)=>{b.addEventListener('click',()=>activatePrice(b.dataset.price));b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-i;const target=document.querySelectorAll('[data-price]')[next];activatePrice(target.dataset.price);target.focus()}})});
  document.querySelector('#price-options').addEventListener('click',e=>{const b=e.target.closest('[data-format]');if(!b)return;pricingFormat=b.dataset.format;document.querySelectorAll('.price-row').forEach(row=>{const active=row===b;row.classList.toggle('selected',active);row.setAttribute('aria-pressed',String(active))});updatePriceSelection()});
  activatePrice('sanger');
  fetch('/api/pricing',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Prices unavailable');return response.json()}).then(schedule=>{
    const keys=Object.values(priceData).flatMap(rows=>rows.flatMap(row=>row.keys));
    if(!schedule.rates||!keys.every(key=>Number.isInteger(schedule.rates[key])&&schedule.rates[key]>=0))throw new Error('Incomplete prices');
    rates=schedule.rates;activatePrice(pricingService,true);
  }).catch(()=>{priceUnavailable=true;activatePrice(pricingService,true)});
  const steps=[['01 / SUBMIT','Ready at your bench.','Confirm your sample requirements, label each tube, and arrange drop-off or pickup with our team.'],['02 / RUN','A little sample. A lot of science.','Your sample moves through preparation and the sequencing workflow selected for your project.'],['03 / RESULTS','Your next question starts here.','Review the sequence data and analysis delivered for your service, then plan your next experiment.']];let journeyTimers=[];
  function clearJourney(){journeyTimers.forEach(clearTimeout);journeyTimers=[]}
  function setStep(i){const machine=document.querySelector('.journey-machine');machine.dataset.step=String(i);document.querySelector('.sample-token').style.left=(i*50)+'%';document.querySelector('.journey-progress>div').style.width=(i*50)+'%';document.querySelector('#step-label').textContent=steps[i][0];document.querySelector('#step-title').textContent=steps[i][1];document.querySelector('#step-description').textContent=steps[i][2];document.querySelectorAll('[data-step]').forEach(b=>{if(b.tagName==='BUTTON'){const active=Number(b.dataset.step)===i;b.classList.toggle('current',active);b.setAttribute('aria-pressed',String(active))}})}
  function playJourney(){clearJourney();setStep(0);if(paused)return;journeyTimers=[setTimeout(()=>setStep(1),1200),setTimeout(()=>setStep(2),2800)]}
  document.querySelectorAll('.journey-nodes button').forEach(b=>b.addEventListener('click',()=>{clearJourney();setStep(Number(b.dataset.step))}));document.querySelector('.journey-replay').addEventListener('click',()=>{if(paused){setStep(0)}else playJourney()});
  const journeyObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){playJourney();journeyObserver.unobserve(e.target)}}},{threshold:.5});journeyObserver.observe(document.querySelector('.journey-machine'));
  function applyMotion(){document.body.classList.toggle('motion-paused',paused);document.documentElement.style.scrollBehavior=paused?'auto':'';motionButton.setAttribute('aria-pressed',String(paused));motionButton.textContent=paused?'Enable motion':'Pause motion';if(paused)clearJourney();document.dispatchEvent(new CustomEvent('seqforge-motion',{detail:{paused}}))}
  motionButton.addEventListener('click',()=>{paused=!paused;applyMotion()});motionMedia.addEventListener('change',()=>{paused=motionMedia.matches;applyMotion()});
  const orderDialog=document.querySelector('#order-dialog'),planner=document.querySelector('#order-planner'),review=document.querySelector('#order-review');
  function resetOrder(){planner.hidden=false;planner.style.display='';review.hidden=true;document.querySelector('#order-heading').textContent='Start with your sample.'}
  document.querySelectorAll('[data-start-order]').forEach(b=>b.addEventListener('click',()=>{resetOrder();orderDialog.showModal()}));document.querySelector('.order-close').addEventListener('click',()=>orderDialog.close());orderDialog.addEventListener('click',e=>{if(e.target===orderDialog){const r=orderDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)orderDialog.close()}});
  planner.elements.service.addEventListener('change',()=>{const s=planner.elements.service.value,formats=s==='nanopore'?['Whole plasmid <12 kb','12–125 kb']:s==='sanger'?['Premixed','Tube','Plate']:['Discuss with team'];planner.elements.format.replaceChildren(...formats.map(f=>{const o=document.createElement('option');o.textContent=f;return o}))});
  planner.addEventListener('submit',e=>{e.preventDefault();if(!planner.reportValidity())return;const service=planner.elements.service.value,format=planner.elements.format.value,count=planner.elements.count.value;const name=planner.elements.service.selectedOptions[0].textContent;review.replaceChildren();const dl=document.createElement('dl');[['Service',name],['Sample format',format],['Samples',count],['Price & timing','To be confirmed']].forEach(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd)});const p=document.createElement('p');p.className='planner-note';p.textContent='Summary only — no order has been submitted. Contact our team to confirm pricing, requirements, and delivery.';const actions=document.createElement('div');actions.className='review-actions';const contact=document.createElement('a');contact.className='lab-button navy';contact.textContent='Discuss this project';contact.href='/contact/?'+new URLSearchParams({service,format,samples:count}).toString();const back=document.createElement('button');back.type='button';back.textContent='Edit summary';back.addEventListener('click',resetOrder);actions.append(contact,back);review.append(dl,p,actions);planner.hidden=true;planner.style.display='none';review.hidden=false;document.querySelector('#order-heading').textContent='Your project at a glance.';contact.focus()});
  setStep(0);applyMotion();
})();
