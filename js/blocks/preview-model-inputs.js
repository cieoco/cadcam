/**
 * blocks / preview-model-inputs
 *
 * 將 Blocks 元件整理成 3D scene-model 所需的唯讀輸入。
 */

export function buildPreviewModelInputs({ comps, params, theta, links, points, groundIds, motorCenterIds, motorTypes, motorMounts, polygons,
  sliderTravelStart, sliderTravelEnd, sliderBodyLength, rackBodyHeight, rackPhaseShift, pulleyRadius, pulleyPinRadius }) {
  const sliders = comps.filter(comp => comp.type === 'slider' && !comp.isInput && comp.p1 && comp.p2 && comp.p3 && comp.m1 && comp.m2)
    .map(comp => ({ id: comp.id, p1: comp.p1.id, p2: comp.p2.id, m1: comp.m1.id, m2: comp.m2.id, p3: comp.p3.id,
      baseEnd: comp.baseEnd === 'p2' ? 'p2' : 'p1', travelStart: sliderTravelStart(comp), travelEnd: sliderTravelEnd(comp),
      carriageLen: sliderBodyLength(comp), color: comp.color }));
  const gears = comps.filter(comp => comp.type === 'gear' && comp.p1 && comp.p2)
    .map(comp => ({ id: comp.id, center: comp.p1.id, pin: comp.p2.id, radius: Number(params[comp.radiusParam]) || 40,
      teeth: comp.teeth, module: comp.module, mesh: comp.mesh, color: comp.color, pinHoleDiameter: Number(comp.pinHoleDiameter) || 5 }));
  const racks = comps.filter(comp => comp.type === 'rack' && comp.p1).map(comp => {
    const pinion = comp.pinion ? comps.find(gear => gear.type === 'gear' && gear.id === comp.pinion) : null;
    const teeth = pinion ? Math.max(6, Math.round(Number(pinion.teeth) || 12)) : 12;
    const radius = pinion ? (Number(params[pinion.radiusParam]) || 40) : 40;
    const module = 2 * radius / teeth, length = Number(params[comp.lenParam]) || 160, axisDeg = Number(comp.axisDeg) || 0;
    return { id: comp.id, ref: comp.p1.id, pinion: comp.pinion, length, axisDeg, bodyHeight: rackBodyHeight(comp, module),
      phaseShift: rackPhaseShift(comp, pinion, { length, module, teeth, axisDeg }), slot: comp.slot, framePins: comp.framePins, color: comp.color };
  });
  const cams = comps.filter(comp => comp.type === 'cam' && comp.p1 && comp.p2)
    .map(comp => ({ id: comp.id, center: comp.p1.id, follower: comp.p2.id, baseRadius: Number(params[comp.baseRadiusParam]) || 24,
      lift: Number(params[comp.liftParam]) || 24, axisDeg: comp.axisDeg, profile: comp.profile, phase: comp.phase,
      rollerRadius: comp.rollerRadius, thetaDeg: theta, color: comp.color }));
  const pulleys = comps.filter(comp => comp.type === 'pulley' && comp.p1 && comp.p2).map(comp => {
    const radius = pulleyRadius(comp);
    return { id: comp.id, center: comp.p1.id, pin: comp.p2.id, radius, pinRadius: pulleyPinRadius(comp, radius),
      rollerWidth: Number(comp.rollerWidth) || 0, color: comp.color };
  });
  const belts = comps.filter(comp => comp.type === 'belt').map(comp => ({ id: comp.id, driver: comp.driver, driven: comp.driven, color: comp.color }));
  return { links, pts: points, groundIds, motorCenterIds, motorTypes, motorMounts, polygons, sliders, gears, racks, cams, pulleys, belts };
}
