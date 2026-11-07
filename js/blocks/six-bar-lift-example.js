/** 六連桿用途的板材化試作；尺寸為本專案示範值，非實測零件規格。
 * 六剛體（含機架）、七轉軸：兩個平行四邊形共用輸入與中間一體桿。
 * 合成資料與手動畫桿後「合成一片」相同，不加入求解或操作特例。
 */
const p = (id, x, y, type = 'floating') => ({ id, x, y, type });
const O = p('SixO', 0, 0, 'fixed'), D = p('SixD', 0, 32, 'fixed');
const A = p('SixA', 64, 0), B = p('SixB', 64, 32), C = p('SixC', 64, 64);
const E = p('SixE', 128, 0), F = p('SixF', 128, 64), T = p('SixTip', 160, 64);
const bar = (id, p1, p2, color, extra = {}) => ({
  type: 'bar', id, p1: { ...p1 }, p2: { ...p2 }, lenParam: id + 'Length',
  fixedLen: true, isInput: false, snapLength: false, color, ...extra
});
const fuse = (members, points) => members.map((c, i) => ({ ...c, barFusionRoot: members[0].id,
  ...(i === 0 ? { barFusion: { version: 1, members: members.map(m => m.id), points: points.map(([id, x, y]) => ({ id, x, y })) } } : {}) }));
export const SIX_BAR_LIFT_EXAMPLE = {
  id: 'six-bar-lift', title: '六連桿升降臂',
  note: '單馬達帶動六個剛體（含機架），橘色工具端保持水平並沿圓弧升降。紅色長臂與綠色中間桿已各自合成一片。',
  adjustmentNote: '先改馬達終角，或點橘色末端改伸出長度。單改閉環桿長可能失去平行或無法到達；承載、五金與全行程干涉尚未驗證。',
  lesson: { group: 'lift-motion', level: '試作',
    use: "參考 六連桿升降用途，以現有連桿與合成一片完成保持末端方向的升降臂。",
    learn: '兩個平行四邊形共用剛體；六連桿包含固定機架，合成後的多段算同一剛體。',
    try: ['點馬達，把終角由 65° 改成 45°，比較末端高度', '點橘色末端，把伸出孔距從 32 改成 40 mm，再復原', '保存作品並重新開啟，確認一體桿與運動保持一致'],
    predict: '工具端保持水平，是否就代表它沿垂直直線上升？',
    measure: '比較起終姿態的工作點高度與水平位移；示範行程為 0°～65°。',
    explain: "尺寸是板材化示範，不是實際施工圖；幾何運動不代表可承重或無干涉。" },
  snapshot: { kind: 'blocks', v: 1, counter: 9, projectName: '六連桿升降臂', tracePoint: 'SixTip',
    comps: [
      bar('SixFrame', O, D, '#95a5a6', { frameSeparate: true }),
      ...fuse([
        bar('SixDrive', { ...O, physicalMotor: '1' }, A, '#e74c3c', { isInput: true, physicalMotor: '1', motorType: 'mg995', phaseOffset: 0, servoStart: 0, servoEnd: 65 }),
        bar('SixExtension', A, E, '#e74c3c')
      ], [['SixO', 0, 0], ['SixA', 64, 0], ['SixE', 128, 0]]),
      bar('SixFollower', D, B, '#3498db'),
      ...fuse([bar('SixMiddle', A, B, '#27ae60'), bar('SixMiddleTop', B, C, '#27ae60')],
        [['SixA', 0, 0], ['SixB', 32, 0], ['SixC', 64, 0]]),
      bar('SixUpper', C, F, '#3498db'),
      ...fuse([bar('SixOutput', E, F, '#e67e22'), bar('SixTool', F, T, '#e67e22')],
        [['SixE', 0, 0], ['SixF', 64, 0], ['SixTip', 64, -32]])
    ],
    params: { theta: 0, SixFrameLength: 32, SixDriveLength: 64, SixExtensionLength: 64,
      SixFollowerLength: 64, SixMiddleLength: 32, SixMiddleTopLength: 32, SixUpperLength: 64, SixOutputLength: 64, SixToolLength: 32 }
  }
};
