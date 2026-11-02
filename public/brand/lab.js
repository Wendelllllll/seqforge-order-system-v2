(() => {
  const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
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
    ],
    oligo:[
      {name:'Standard DNA · shorter oligos',description:'25 nmol · Desalted · Unmodified',keys:[],type:'standard',tier:'short'},
      {name:'Standard DNA · longer oligos',description:'25 nmol · Desalted · Unmodified',keys:[],type:'standard',tier:'long'},
      {name:'Other specifications',description:'Other scales, purification or modifications',keys:[],quote:true}
    ]
  };
  const priceServices={sanger:{label:'Sanger',tab:'price-tab-sanger'},nanopore:{label:'Whole Plasmid',tab:'price-tab-nano'},oligo:{label:'Oligo',tab:'price-tab-oligo'}};
  let pricingService='sanger',pricingFormat='Standard',rates=null,oligoPrice=null,priceUnavailable=false;
  const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  function updatePriceSelection(){
    const option=priceData[pricingService].find(row=>row.name===pricingFormat);
    document.querySelector('#price-selection').textContent=priceServices[pricingService].label+' / '+(option.type?option.name:option.name.replace('Whole plasmid ',''));
    document.querySelector('#price-unit').textContent=pricingService==='oligo'?(option.quote?'Quote required':'USD / base'):pricingService==='sanger'?'USD / reaction':'USD / sample';
    document.querySelector('#quote-link').href=pricingService==='oligo'?'/orders/new?service=oligo'+(option.type?'&type='+option.type:''):pricingService==='sanger'?'/orders/new?service=sanger&type='+option.type:'/orders/new?service=whole-plasmid';
    document.querySelector('#quote-link').textContent=option.quote?'Request a quote':'Start an order';
    document.querySelector('#price-status').textContent=pricingService==='oligo'&&option.quote?'Send your sequences and specifications. Our team will confirm the quote before production. Taxes and shipping are excluded.':priceUnavailable?'Prices are temporarily unavailable. Please reload or check the order form.':!rates?'Loading current prices…':pricingService==='oligo'?'Standard DNA, 25 nmol, Desalted, without modifications. Each oligo uses its length tier for all bases. Other specifications require a quote. Taxes and shipping are excluded.':pricingService==='sanger'?'Current sequencing rates. Each primer reaction is charged separately. Taxes, shipping and additional services are excluded.':'Current rates for purified plasmid DNA. Enter the expected size when ordering; unknown sizes need lab confirmation. Taxes, shipping and additional services are excluded.';
  }
  function activatePrice(service,keepSelection=false){
    pricingService=service;
    if(!keepSelection)pricingFormat=priceData[service][0].name;
    const options=document.querySelector('#price-options');options.replaceChildren();
    priceData[service].forEach(({name,description,keys,quote,tier})=>{
      const selected=name===pricingFormat,b=document.createElement('button');b.type='button';b.className='price-row'+(selected?' selected':'');b.dataset.format=name;b.setAttribute('aria-pressed',String(selected));
      const span=document.createElement('span');span.append(document.createTextNode(name));const small=document.createElement('small');small.textContent=service==='oligo'&&oligoPrice?(quote?'Other scales, purification or modifications':(tier==='short'?'≤ '+oligoPrice.shortMaxBases:'> '+oligoPrice.shortMaxBases)+' bp · 25 nmol · Desalted · Unmodified'):description;span.append(small);
      const price=document.createElement('b');
      if(quote)price.textContent='Quote';
      else if(service==='oligo'&&oligoPrice){const cents=tier==='long'?oligoPrice.longUnitCents:oligoPrice.shortUnitCents;if(cents===null)price.textContent='Quote';else{price.append(document.createTextNode(money.format(cents/100)));const unit=document.createElement('small');unit.textContent='/ base';price.append(unit)}}
      else if(rates&&service!=='oligo'){price.append(document.createTextNode(money.format(rates[keys[0]]/100)+' tubes'));const plate=document.createElement('small');plate.textContent=money.format(rates[keys[1]]/100)+' plate';price.append(plate)}
      else price.textContent=priceUnavailable?'Unavailable':'Loading…';
      b.append(span,price);options.append(b);
    });
    document.querySelectorAll('[data-price]').forEach(b=>{const active=b.dataset.price===service;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});document.querySelector('#price-panel').setAttribute('aria-labelledby',priceServices[service].tab);updatePriceSelection();
  }
  const priceTabs=[...document.querySelectorAll('[data-price]')];
  priceTabs.forEach((b,i)=>{b.addEventListener('click',()=>activatePrice(b.dataset.price));b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?priceTabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+priceTabs.length)%priceTabs.length;const target=priceTabs[next];activatePrice(target.dataset.price);target.focus()}})});
  document.querySelector('#price-options').addEventListener('click',e=>{const b=e.target.closest('[data-format]');if(!b)return;pricingFormat=b.dataset.format;document.querySelectorAll('.price-row').forEach(row=>{const active=row===b;row.classList.toggle('selected',active);row.setAttribute('aria-pressed',String(active))});updatePriceSelection()});
  activatePrice('sanger');
  fetch('/api/pricing',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Prices unavailable');return response.json()}).then(schedule=>{
    const keys=Object.values(priceData).flatMap(rows=>rows.flatMap(row=>row.keys));
    if(!schedule.rates||!keys.every(key=>Number.isInteger(schedule.rates[key])&&schedule.rates[key]>=0))throw new Error('Incomplete prices');
    if(!schedule.oligo||!Number.isInteger(schedule.oligo.shortUnitCents)||schedule.oligo.shortUnitCents<0||!(schedule.oligo.longUnitCents===null||(Number.isInteger(schedule.oligo.longUnitCents)&&schedule.oligo.longUnitCents>=0))||!Number.isInteger(schedule.oligo.shortMaxBases)||schedule.oligo.shortMaxBases<1)throw new Error('Incomplete oligo prices');
    rates=schedule.rates;oligoPrice=schedule.oligo;activatePrice(pricingService,true);
  }).catch(()=>{priceUnavailable=true;activatePrice(pricingService,true)});
  const steps=[['01 / SUBMIT','Ready at your bench.','Confirm your sample requirements, label each tube, and arrange drop-off or pickup with our team.'],['02 / RUN','A little sample. A lot of science.','Your sample moves through preparation and the sequencing workflow selected for your project.'],['03 / RESULTS','Your next question starts here.','Review the sequence data and analysis delivered for your service, then plan your next experiment.']];let journeyTimers=[];
  function clearJourney(){journeyTimers.forEach(clearTimeout);journeyTimers=[]}
  function setStep(i){const machine=document.querySelector('.journey-machine');machine.dataset.step=String(i);document.querySelector('.sample-token').style.left=(i*50)+'%';document.querySelector('.journey-progress>div').style.width=(i*50)+'%';document.querySelector('#step-label').textContent=steps[i][0];document.querySelector('#step-title').textContent=steps[i][1];document.querySelector('#step-description').textContent=steps[i][2];document.querySelectorAll('[data-step]').forEach(b=>{if(b.tagName==='BUTTON'){const active=Number(b.dataset.step)===i;b.classList.toggle('current',active);b.setAttribute('aria-pressed',String(active))}})}
  function playJourney(){clearJourney();setStep(0);if(paused)return;journeyTimers=[setTimeout(()=>setStep(1),1200),setTimeout(()=>setStep(2),2800)]}
  document.querySelectorAll('.journey-nodes button').forEach(b=>b.addEventListener('click',()=>{clearJourney();setStep(Number(b.dataset.step))}));document.querySelector('.journey-replay').addEventListener('click',()=>{if(paused){setStep(0)}else playJourney()});
  const journeyObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){playJourney();journeyObserver.unobserve(e.target)}}},{threshold:.5});journeyObserver.observe(document.querySelector('.journey-machine'));
  function applyMotion(){document.body.classList.toggle('motion-paused',paused);document.documentElement.style.scrollBehavior=paused?'auto':'';if(paused)clearJourney();document.dispatchEvent(new CustomEvent('seqforge-motion',{detail:{paused}}))}
  motionMedia.addEventListener('change',()=>{paused=motionMedia.matches;applyMotion()});
  setStep(0);applyMotion();
})();
