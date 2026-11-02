const dialog=document.querySelector('#detail');
const services=[['Sanger Service','sanger'],['Nanopore Sequencing','nanopore'],['Molecular service','molecular']];
function show(kicker,title,html){document.querySelector('#dialog-kicker').textContent=kicker;document.querySelector('#dialog-title').textContent=title;document.querySelector('#dialog-content').innerHTML=html;if(!dialog.open)dialog.showModal()}
document.addEventListener('click',e=>{if(e.target.closest('[data-order]'))show('LET’S START WITH YOUR SCIENCE','Explore our services',`<p>Choose a service to learn more.</p><div class="option-list">${services.map(([t,s])=>`<a href="/services/${s}/">${t}</a>`).join('')}</div>`);if(e.target.closest('[data-guide]'))show('BEFORE YOU SEND','Your sample preparation checklist',`<p>Get your project ready for a service-specific discussion.</p><div class="checklist">${['Identify your sample type and research objective.','Prepare sample IDs and a sample count.','Confirm the required concentration, volume, and purity.','Confirm packaging, shipping address, and dispatch timing.'].map(t=>`<label><input type="checkbox">${t}</label>`).join('')}</div><p class="demo-note">Confirm the final service-specific requirements before sending any samples.</p>`)});
document.querySelector('.close')?.addEventListener('click',()=>dialog.close());dialog?.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
const menu=document.querySelector('.menu'),nav=document.querySelector('nav');menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
const dropdown=document.querySelector('.nav-dropdown'),toggle=document.querySelector('.services-toggle');
function setDropdown(open){dropdown.classList.toggle('expanded',open);toggle.setAttribute('aria-expanded',String(open))}
toggle.addEventListener('click',e=>setDropdown(e.detail>0 && matchMedia('(min-width:761px) and (hover:hover)').matches ? true : !dropdown.classList.contains('expanded')));
dropdown.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse' && matchMedia('(min-width:761px) and (hover:hover)').matches)setDropdown(true)});dropdown.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!dropdown.contains(document.activeElement))setDropdown(false)});
dropdown.addEventListener('focusout',()=>setTimeout(()=>{if(!dropdown.contains(document.activeElement))setDropdown(false)},0));
document.addEventListener('click',e=>{if(!dropdown.contains(e.target))setDropdown(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(dropdown.classList.contains('expanded')){setDropdown(false);toggle.focus()}nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}});
nav.addEventListener('click',e=>{if(e.target.closest('a')){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');setDropdown(false)}});
document.querySelector('.motion-toggle')?.addEventListener('click',e=>{const paused=document.querySelector('.seal-float').classList.toggle('paused');e.target.textContent=paused?'Play animation':'Pause animation';e.target.setAttribute('aria-pressed',String(paused))});
const contact=document.querySelector('#contact-form');
if(contact){
  const query=new URLSearchParams(location.search),selected=query.get('service');
  if(services.some(([,s])=>s===selected))contact.elements.service.value=selected;
  const format=query.get('format'),samples=query.get('samples');
  const allowedFormats=['Premixed','Tube','Plate','Whole plasmid <12 kb','12–125 kb','Discuss with team'];
  if(allowedFormats.includes(format)){
    const lines=['I would like to discuss a sequencing project.','Sample format: '+format];
    if(samples && /^\d{1,5}$/.test(samples) && Number(samples)>=1 && Number(samples)<=10000)lines.push('Number of samples: '+samples);
    contact.elements.message.value=lines.join('\n');
  }
  const campus=query.get('campus');
  if(['UCSD','UCI','UCR','Scripps','Other location'].includes(campus))contact.elements.message.value='I would like to confirm sample pickup availability for '+campus+'. Please advise on coverage, schedule, and fees.';

  const status=contact.querySelector('.form-status'),submit=contact.querySelector('button[type="submit"]');
  submit.disabled=false;
  let sending=false,lastPayload='',requestKey='',sentPayload='';
  contact.addEventListener('input',()=>{
    if(sending)return;
    status.textContent='';
    status.removeAttribute('data-state');
    submit.disabled=false;
    submit.textContent='Send message';
  });
  contact.addEventListener('submit',async e=>{
    e.preventDefault();
    if(sending || !contact.reportValidity())return;
    const data=new FormData(contact);
    const payload=Object.fromEntries(['name','email','organization','service','message','website'].map(key=>[key,String(data.get(key)||'').trim()]));
    const serialized=JSON.stringify(payload);
    if(serialized===sentPayload){
      status.textContent='This message has already been sent. Our team will reply to your email.';
      status.dataset.state='success';
      return;
    }
    if(serialized!==lastPayload){
      requestKey=crypto.randomUUID();
      lastPayload=serialized;
    }
    const controls=[...contact.querySelectorAll('input,select,textarea,button')];
    const disabledStates=controls.map(control=>control.disabled);
    sending=true;
    controls.forEach(control=>{control.disabled=true;});
    contact.setAttribute('aria-busy','true');
    submit.textContent='Sending…';
    status.textContent='Sending your message…';
    status.dataset.state='sending';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    let failureMessage='';
    try{
      const response=await fetch('/api/contact',{
        method:'POST',
        headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},
        body:serialized,
        signal:controller.signal
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok || result?.success!==true){
        failureMessage=typeof result?.error==='string' ? result.error : 'We couldn’t send your message. Please try again or email info@seqforge.com.';
        throw new Error('Contact request failed');
      }
      sentPayload=serialized;
      status.textContent='Your message has been sent to our team. We’ll reply to the email address you provided.';
      status.dataset.state='success';
    }catch(error){
      status.textContent=error.name==='AbortError'
        ? 'We couldn’t confirm delivery yet. Your message is still here; please try again, or email info@seqforge.com.'
        : failureMessage || 'We couldn’t connect. Your message is still here; check your connection and try again, or email info@seqforge.com.';
      status.dataset.state='error';
    }finally{
      clearTimeout(timeout);
      sending=false;
      contact.removeAttribute('aria-busy');
      controls.forEach((control,index)=>{control.disabled=disabledStates[index];});
      submit.textContent=sentPayload===serialized ? 'Message sent' : 'Send message';
      submit.disabled=sentPayload===serialized;
    }
  });
}
document.querySelector('.show-password')?.addEventListener('click',e=>{const field=document.querySelector('#password'),reveal=field.type==='password';field.type=reveal?'text':'password';e.target.textContent=reveal?'Hide':'Show';e.target.setAttribute('aria-label',reveal?'Hide password':'Show password');e.target.setAttribute('aria-pressed',String(reveal))});
document.querySelector('#login-form')?.addEventListener('submit',e=>{e.preventDefault();e.currentTarget.querySelector('.form-status').textContent='Account access is not connected yet. No login request was sent.';e.currentTarget.elements.password.value=''});
