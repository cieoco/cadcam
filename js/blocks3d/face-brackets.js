/** Display adapters only: solid construction lives in the shared physical core. */
export function faceBracketBoxes(plan) {
  return plan?.ok ? plan.physical.flatMap(b=>b.wings.map(w=>w.box)) : [];
}
export function faceBracketScrews(plan) {
  return plan?.ok ? plan.physical.flatMap(b=>b.wings.map(w=>w.screw)) : [];
}
