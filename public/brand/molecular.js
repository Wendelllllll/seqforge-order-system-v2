(() => {
  const applications={rflp:['RFLP analysis','Planning an RFLP experiment? Discuss your application and fragment analysis needs with our team.','Bring your sample details and experimental goals so we can help you plan the next step.','RFLP'],itd:['ITD analysis','Explore capillary electrophoresis for your ITD application with support from our technical team.','Discuss your assay and the results you need before preparing your submission.','ITDs'],micro:['Microsatellite analysis','Working with microsatellites? Talk with us about fragment analysis for your experiment.','Share your study goals and sample information to discuss the appropriate workflow.','Microsatellites']};
  document.querySelectorAll('[data-application]').forEach(button=>button.addEventListener('click',()=>{
    const [title,copy,note,name]=applications[button.dataset.application];
    document.querySelectorAll('[data-application]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.getElementById('application-title').textContent=title;
    document.getElementById('application-copy').textContent=copy;
    document.getElementById('application-note').textContent=note;
    document.getElementById('application-contact').href='/contact/?service=molecular&application='+encodeURIComponent(name);
  }));
  if(!document.querySelector('.mol-checklist'))return;
  const checks=[...document.querySelectorAll('.mol-checklist input')];
  function update(){const count=checks.filter(c=>c.checked).length;const bar=document.querySelector('.mol-progress');bar.setAttribute('aria-valuenow',count);bar.firstElementChild.style.width=(count/3*100)+'%';document.getElementById('checklist-status').textContent=count===3?'3 of 3 checked — your preparation checklist is complete.':count+' of 3 steps checked';}
  checks.forEach(c=>c.addEventListener('change',update));update();
})();
