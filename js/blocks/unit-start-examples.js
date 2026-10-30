// 第四～十二單元各自的起始練習檔：只在第一次需要時才載入（見 examples.js 的 loadUnitStarts），不放進啟動程式。
// 全部由既有範例複製後改幾個欄位，不另抄座標；學生不必用上一單元保存的作品開始，每個單元都能單獨練習。
const clone = value => JSON.parse(JSON.stringify(value));
const moveModule = (snapshot, moduleId, dx) => snapshot.comps.filter(c => c.moduleId === moduleId)
  .forEach(c => ['p1', 'p2', 'p3'].forEach(key => { if (c[key]) c[key].x += dx; }));

// [id, 來源範例, 標題, 這個檔案有什麼, 建議的第一步, 改寫複本]
const STARTS = [
  ['unit4-start', 'empty-challenge', '第四單元：齒輪傳動練習',
    '空白畫布。第四單元從新增齒輪對開始，不需要前面單元的作品。',
    ['新增 → 其他零件 → 齒輪對，建立 15／20 齒、模數 4，固定右輪、左輪裝 TT 馬達'], () => {}],
  ['unit5-start', 'gear-pair', '第五單元：已存好的齒輪對',
    '第四單元做好的樣子：15／20 齒、兩輪中心固定、左輪 MG995 輸入 0°～30°。還沒有夾指。',
    ['把右輪改成 15 齒、結束角縮到 15°，再用折線桿各畫一支夾指'],
    snapshot => Object.assign(snapshot.comps.find(c => c.id === 'GearA'), { motorType: 'mg995', servoStart: 0, servoEnd: 30 })],
  ['unit6-start', 'competition-rack-lift', '第六單元：齒條升降練習',
    '垂直齒條升降器，導軌槽長 144 mm；行程還沒有調到 100～110 mm。',
    ['選小齒輪，只把「導軌槽長」改成 128 mm，再量行程'], () => {}],
  ['unit7-start', 'tipping-bucket', '第七單元：單軸翻斗練習',
    '四板翻斗與單側 MG995 支架，結束角還是 −100°；尚未調成 −70°。',
    ['點 O 馬達，只把結束角改成 −70°，播放 0°→−70°→0°'], () => {}],
  ['unit11-start', 'hydraulic-h05', '第十一單元：升降與夾爪待接合',
    '「升降」與「夾爪」各有一支針筒，兩個模組分開放著，還沒有接合。',
    ['切到組立，把夾爪接到升降臂的工具端，再推兩支針筒確認'],
    snapshot => { snapshot.modules.find(m => m.id === 'Grip').mount = null; moveModule(snapshot, 'Grip', 260); }],
  ['unit12-start', 'hydraulic-h06', '第十二單元：機械手臂待加底盤',
    '升降＋夾爪已接好；「旋轉底盤」另外放著，升降還沒有立在轉盤上。',
    ['切到組立，把旋轉底盤設為底座，再把升降接到轉盤板上'],
    snapshot => { snapshot.modules.find(m => m.id === 'Lift').mount = null; }]
];

/** 把起始練習檔加進範例清單與教學資料；重複呼叫不會重複加入。 */
export function register(examples, lessons) {
  for (const [id, source, title, use, steps, edit] of STARTS) {
    if (examples.some(e => e.id === id)) continue;
    const snapshot = clone(examples.find(e => e.id === source).snapshot);
    snapshot.projectName = title;
    edit(snapshot);
    examples.push({ id, title, note: use, snapshot });
    lessons[id] = { group: 'challenge', level: '練習', use, try: steps };
  }
}
