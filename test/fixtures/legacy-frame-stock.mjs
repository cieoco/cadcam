/** These collision/drilling fixtures pin their historical hull geometry.
 * Only opt-in fixtures remove the later built-in grid envelope metadata. */
export function legacyFrameStock(comps,moduleId){
 for(const c of comps)if(moduleId===undefined||c.moduleId===moduleId)for(const k of ['p1','p2','p3','m1','m2'])if(c[k])delete c[k].frameStock;
 return comps;
}
