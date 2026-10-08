import { LOAD_GRAPH_TOKEN } from './load-graph.js';
export { LOAD_GRAPH_TOKEN };

// Script src bypasses import maps. Keep non-version query parameters and anchors.
export function moduleEntryUrl(specifier, base) {
  const url = new URL(specifier, base);
  url.searchParams.set('v', LOAD_GRAPH_TOKEN);
  return url;
}
