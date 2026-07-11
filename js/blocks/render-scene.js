/**
 * blocks / render-scene
 *
 * draw() 的場景準備階段：整理固定點、馬達、三角板邊與 2D/3D 共用疊放層。
 */

export function collectSceneIds({ compiled, comps, motorPointIds }) {
  const steps = compiled.steps || [];
  const groundIds = new Set(steps.filter(step => step.type === 'ground').map(step => step.id));
  const motorCenterIds = new Set(steps.filter(step => step.type === 'input_crank').map(step => step.center));
  motorPointIds.forEach(id => motorCenterIds.add(id));
  const modelMotorCenterIds = new Set(motorCenterIds);
  motorPointIds.forEach(id => modelMotorCenterIds.add(id));
  const camCenterIds = new Set(comps.filter(comp => comp.type === 'cam' && comp.p1).map(comp => comp.p1.id));
  return { groundIds, motorCenterIds, modelMotorCenterIds, camCenterIds };
}

export function prepareRenderScene({ compiled, comps, points, frameGeometry, sceneIds, computeBodyLayers, motorAssemblyLayerForBody, motorMounts }) {
  const visualization = compiled.visualization || { links: [], polygons: [] };
  const { groundIds, motorCenterIds, modelMotorCenterIds, camCenterIds } = sceneIds;
  const isGroundBar = link => Boolean(frameGeometry) && !comps.some(comp => comp.id === link.id && comp.frameSeparate) && groundIds.has(link.p1) && groundIds.has(link.p2);
  const triangleEdgeKeys = new Set();
  (visualization.polygons || []).forEach(polygon => {
    if (!polygon.points || polygon.points.length !== 3) return;
    const [p1, p2, p3] = polygon.points;
    [[p1, p2], [p1, p3], [p2, p3]].forEach(pair => triangleEdgeKeys.add([...pair].sort().join('|')));
  });
  const validPoint = id => points[id] && Number.isFinite(points[id].x) && Number.isFinite(points[id].y);
  const triangleKey = ids => [...ids].sort().join('|');
  const layerLinks = (visualization.links || []).filter(link => link && !link.hidden && validPoint(link.p1) && validPoint(link.p2) &&
    !triangleEdgeKeys.has([link.p1, link.p2].sort().join('|')) && !isGroundBar(link));
  const triangleComps = comps.filter(comp => comp.type === 'triangle' && comp.p1 && comp.p2 && comp.p3 && validPoint(comp.p1.id) && validPoint(comp.p2.id) && validPoint(comp.p3.id));
  (visualization.links || []).forEach(link => {
    const comp = link.id ? comps.find(item => item.id === link.id) : null;
    link._zlift = comp?.zlift || 0;
    link._frameSeparate = Boolean(comp?.frameSeparate);
  });
  (visualization.polygons || []).forEach(polygon => {
    const key = triangleKey(polygon.points);
    const triangle = triangleComps.find(comp => triangleKey([comp.p1.id, comp.p2.id, comp.p3.id]) === key);
    polygon._zlift = triangle?.zlift || 0;
  });
  const bodyLayers = computeBodyLayers([
    ...layerLinks.map(link => ({ joints: [link.p1, link.p2], lift: link._zlift || 0,
      motorDriven: link.style === 'crank' && (motorCenterIds.has(link.p1) || motorCenterIds.has(link.p2)),
      assemblyLayer: motorAssemblyLayerForBody(link.id, motorMounts) })),
    ...triangleComps.map(comp => ({ joints: [comp.p1.id, comp.p2.id, comp.p3.id], lift: comp.zlift || 0 }))
  ], groundIds);
  const linkLayer = new Map();
  layerLinks.forEach((link, index) => linkLayer.set(link, bodyLayers[index]));
  const triangleLayerByKey = new Map();
  triangleComps.forEach((comp, index) => triangleLayerByKey.set(triangleKey([comp.p1.id, comp.p2.id, comp.p3.id]), bodyLayers[layerLinks.length + index]));
  return { groundIds, motorCenterIds, modelMotorCenterIds, camCenterIds, isGroundBar, triangleEdgeKeys, validPoint, triangleKey,
    layerLinks, triangleComps, bodyLayers, linkLayer, triangleLayerByKey };
}
