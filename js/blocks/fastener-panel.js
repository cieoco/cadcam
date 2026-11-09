/** The assembly-only controls need not load with the basic 2D editor. */
export function fastenerPanel(options) {
  const root = document.createElement('div');
  root.className = 'bench-section';
  import('./fastener-choice.js').then(({renderFastenerButtons}) => {
    if (root.isConnected && options.isCurrent()) renderFastenerButtons(root, options);
  }).catch(() => { if (root.isConnected) root.textContent = '固定方式載入失敗，請重新選取零件。'; });
  return root;
}
