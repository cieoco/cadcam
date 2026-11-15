/** A frame changes from the shared root plate to a module plate in a mounted preview. */
export function matchesSurfacePart(surface, part) {
  if (!surface || !part || surface.moduleId !== part.moduleId) return false;
  if (surface.kind !== 'frame') return part.partId === surface.compId;
  return part.partId === surface.framePartId || part.partId === `${surface.moduleId}-frame`;
}
