import { LEGO_FRAME_STEP } from './model.js';

const TEETH_MAX = 60;
// 優先精確減速比，再保留目前軸距；相同軸距優先選較粗的齒。
export function fitGearReduction(ratio, distance, fixed = false) {
  let best = null;
  for (const module of [4, 3, 2]) {
    for (let input = 18; input <= TEETH_MAX; input++) {
      const output = input * ratio;
      if (!Number.isInteger(output) || output < input || output > TEETH_MAX) continue;
      const center = module * (input + output) / 2;
      if (!Number.isInteger(center / LEGO_FRAME_STEP)) continue;
      const error = Math.abs(center - distance);
      if (fixed && error > 0.001) continue;
      if (!best || error < best.error) best = {module, input, output, center, error};
    }
  }
  return best;
}
