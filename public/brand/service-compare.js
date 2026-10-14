(() => {
  const section=document.querySelector('[data-service-compare]');if(!section)return;
  const choices={
    sanger:['Checking a known region? Sanger is a practical starting point for an insert, PCR product or targeted base call.','Explore Sanger','/services/sanger/'],
    plasmid:['Validating a complete construct? Whole Plasmid Sequencing puts the insert and backbone into one sequence context.','Explore whole plasmids','/services/nanopore/'],
    amplicon:['Working with a long target? Linear / Amplicon Sequencing helps examine sequence continuity across the region of interest.','Explore long targets','/services/nanopore/'],
    fragment:['Comparing fragment sizes? Fragment Analysis is designed for size-based patterns and assay-specific markers.','Explore fragment analysis','/services/molecular/'],
    all:['Each approach answers a different question. Compare the strengths and planning considerations below.','Help me choose','/contact/']
  };
  section.querySelectorAll('[data-goal]').forEach(button=>button.addEventListener('click',()=>{
    const goal=button.dataset.goal,choice=choices[goal];
    section.querySelectorAll('[data-goal]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    section.querySelectorAll('[data-service]').forEach(cell=>cell.dataset.match=String(cell.dataset.service===goal));
    section.querySelector('[data-compare-message]').textContent=choice[0];
    const link=section.querySelector('[data-compare-link]');link.textContent=choice[1]+' →';link.href=choice[2];
    if(matchMedia('(max-width:650px)').matches && goal!=='all'){
      const table=section.querySelector('table'),cell=table.querySelector('thead [data-service="'+goal+'"]');
      const left=cell.getBoundingClientRect().left-table.getBoundingClientRect().left+table.scrollLeft-110;
      table.scrollTo({left,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
    }
  }));
})();
