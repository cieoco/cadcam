// 外掛清單，見 docs/PLUGINS.md
export const PLUGINS = [
  { id: 'box-maker', name: '卡榫盒子', hint: '輸入尺寸，生成盒體', icon: '📦', load: () => import('./box-maker/index.js') }
];
