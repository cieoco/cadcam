// 共用測試 harness（headless，零相依）。
// 跑法：node test/<某個範例>.mjs    （Node ≥22 會自動偵測 ESM，免旗標、免 package.json）
//
// 每個範例測試檔 import 這裡的 helper，把一組 comps 編譯 + 掃 theta 求解，再對「機構性質」下斷言。
// 走的是真正的核心：js/core/topology.js（compile）+ js/multilink/solver.js（solve，blocks 那條 bodyJoint 路徑）。
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

// 把一組 comps + params 編譯，並在 [0,360] 掃 theta 求解，回傳每幀的解點。
// 回傳 { frames:[{theta, points}], allValid:boolean }。allValid＝每幀關鍵點都解得出且有限。
export function sweep(comps, params, watchIds = [], stepDeg = 10) {
  const topo = { params: { theta: 0, ...params }, tracePoint: '' };
  const compiled = compileTopology(comps, topo, new Set());
  const frames = [];
  let allValid = true;
  for (let theta = 0; theta <= 360; theta += stepDeg) {
    const sol = solveTopology(compiled, { thetaDeg: theta });
    const points = (sol && sol.points) || {};
    const ok = watchIds.every(id => points[id] && Number.isFinite(points[id].x) && Number.isFinite(points[id].y));
    if (!ok) allValid = false;
    frames.push({ theta, points });
  }
  return { frames, allValid };
}

// 角度（點 p 相對中心 c）、與跨幀展開累計（用來算總轉角、轉速比）。
export const angle = (p, c) => Math.atan2(p.y - c.y, p.x - c.x);
export function unwrapSum(values) {
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    let d = values[i] - values[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sum += d;
  }
  return sum;
}

// 極簡斷言：收集結果，最後 report() 印出並以 exit code 反映通過與否（CI/agent 友善）。
const results = [];
export function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS ✅' : 'FAIL ❌'}  ${name}${detail ? '  — ' + detail : ''}`);
}
export function report(suiteName) {
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n[${suiteName}] ${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}
