/** One selected part and face per design; old role-based records remain readable. */
export function connectionSelection(mod, role = 'host') {
  const value = mod?.faceParts;
  if (!value) return null;
  if (value.part && value.face) return { part: value.part, face: value.face };
  const output = mod.outputs?.find(o => o.id === value.receive);
  return role === 'host' && output?.body?.id
    ? { part: output.body.id, face: value.receiveFace || 'top' }
    : { part: value.attach || 'frame', face: value.attachFace || 'bottom' };
}
