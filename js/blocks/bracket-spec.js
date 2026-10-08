/** Shared metal bracket specification; independent of placement strategies. */
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';

export const BRACKET_SCREW_LENGTHS_MM = Object.freeze([6, 8, 10, 12, 16, 20, 25, 30, 35, 40]);
export const bracketScrewLength = span => BRACKET_SCREW_LENGTHS_MM.find(l => l >= span) || Math.ceil(span);
export function metalBracketSpec(joint = FABRICATION_DEFAULTS.joint) {
  const defaults = FABRICATION_DEFAULTS.joint.bracket, raw = joint?.bracket || defaults;
  const pick = key => Number.isFinite(Number(raw[key])) && Number(raw[key]) > 0 ? Number(raw[key]) : defaults[key];
  const widthMm = pick('widthMm'), thicknessMm = pick('thicknessMm'), longLegMm = pick('longLegMm'), shortLegMm = pick('shortLegMm'), holeEndMm = pick('holeEndMm');
  return { label: `M3 帶牙金屬角碼 ${longLegMm}×${shortLegMm}×${widthMm}`, widthMm, thicknessMm, longLegMm, shortLegMm, holeEndMm,
    hostHoleMm: longLegMm - holeEndMm, childHoleMm: shortLegMm - holeEndMm,
    plateHoleDiameterMm: 3.2, threadedHoleDiameterMm: 3, webMm: 2, threaded: true, tiltable: false, count: 2, screw: 'M3×6' };
}

export function bracketSpecIssue(spec) {
  const radius=spec.threadedHoleDiameterMm/2;
  if(spec.widthMm < 2*radius || [spec.longLegMm,spec.shortLegMm].some(l=>spec.holeEndMm < radius || l-spec.holeEndMm < radius)) return '角碼牙孔超出翼材，請調整角碼尺寸與孔距';
  return '';
}
