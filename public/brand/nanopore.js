(() => {
  const copy = document.getElementById('np-flow-copy');
  if (!copy) return;
  const flow = ['Submit purified DNA with matching sample labels, expected sizes and accurate quantification.', 'DNA passes through nanopores. Changes in electrical signal are translated into sequence data.', 'Reads are processed into consensus sequences, with quality metrics and project-specific annotation.', 'Review your sequence and quality files. Add a reference for construct comparison or discuss custom analysis.'];
  const buttons = document.querySelectorAll('[data-np-flow]');
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    copy.textContent = flow[Number(button.dataset.npFlow)];
  }));
})();
