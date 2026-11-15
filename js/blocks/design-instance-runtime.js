// Loaded only for repeated designs or opening a work that contains them.
let api=null;
export async function loadDesignInstances(){return api || (api=await import('./design-instances.js'));}
export function designInstances(){if(!api)throw Error('共享設計尚未載入');return api;}
