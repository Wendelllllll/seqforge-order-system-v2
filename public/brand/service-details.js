(()=>{
 const paths={tube:'M9 3h6M10 3v11l-3 5a2 2 0 0 0 2 3h6a2 2 0 0 0 2-3l-3-5V3M9 16h6',support:'M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v6h4v-6H4m16 0h2v6h-4v-6h2m0 6v2h-6',signal:'M2 18h3l2-12 3 15 4-18 3 15h5',sequence:'M3 5h18M3 12h18M3 19h18M7 3v4m9 3v4m-5 3v4',report:'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h5',box:'m3 7 9-4 9 4v13H3zM3 7l9 4 9-4M12 11v9',check:'m5 12 4 4L19 6',dna:'M6 2c0 9 12 11 12 20M18 2C18 11 6 13 6 22M7 5h10M9 10h6M9 14h6M7 19h10',tag:'M3 3h8l10 10-8 8L3 11zM7 7h.01'};
 const icon=(name)=>`<svg class="sf-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.report}"/></svg>`;
 document.querySelectorAll('.benefit-row article').forEach(article=>{const text=article.textContent.toLowerCase(),mark=article.querySelector('.small-mark');if(mark)mark.innerHTML=icon(/support|expert/.test(text)?'support':/template|read|context/.test(text)?'dna':/sample|preparation/.test(text)?'tube':'report');});
 document.querySelectorAll('.file-menu button').forEach((button,i)=>button.insertAdjacentHTML('afterbegin',icon(['signal','sequence','report'][i])));
 document.querySelectorAll('.fx-tabs button').forEach((button,i)=>{const mark=button.querySelector('.fx-tab-number');if(mark)mark.innerHTML=icon(['signal','report','sequence'][i]);});
})();
