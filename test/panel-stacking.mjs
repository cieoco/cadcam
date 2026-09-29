// 面板堆疊驗收（P1）：節點面板開著時，機架面板必須收進節點面板內成為一段，
// 不可再以獨立的 inspector-panel 疊在上面；節點面板關閉時回到原本的獨立位置。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(id = '') {
    this.id = id; this.children = []; this.parentNode = null;
    this.style = {}; this.dataset = {}; this.textContent = ''; this.value = '';
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const list = this.parentNode.children;
    return list[list.indexOf(this) + 1] || null;
  }
  _detach() {
    if (!this.parentNode) return;
    const list = this.parentNode.children;
    list.splice(list.indexOf(this), 1);
    this.parentNode = null;
  }
  appendChild(child) { child._detach(); child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, ref) {
    if (ref == null) return this.appendChild(child);
    child._detach();
    const at = this.children.indexOf(ref);
    if (at < 0) throw new Error('insertBefore: ref is not a child');
    child.parentNode = this; this.children.splice(at, 0, child); return child;
  }
  addEventListener() {}
}

const els = new Map();
const byId = id => { if (!els.has(id)) els.set(id, new FakeElement(id)); return els.get(id); };
globalThis.document = { getElementById: byId, createElement: () => new FakeElement() };

// 對照 blocks.html：同一個容器內 roleEditor 之後緊接 frameEditor，再之後是 servoEditor。
const container = new FakeElement('stage');
const role = byId('roleEditor'), frame = byId('frameEditor'), servo = byId('servoEditor');
const moduleRow = byId('moduleEditor');
[byId('lenEditor'), moduleRow, role, frame, servo].forEach(el => container.appendChild(el));
role.style.display = 'none'; frame.style.display = 'none';

const { S } = await import('../js/blocks/state.js');
const Panels = await import('../js/blocks/panels.js');

check('panels.js 匯出 placeFrameEditor', typeof Panels.placeFrameEditor === 'function');
if (typeof Panels.placeFrameEditor !== 'function') { report('panel-stacking'); process.exit(1); }

// 1. 節點面板顯示中 → 機架面板收進去，並標記 embedded
role.style.display = 'flex';
Panels.placeFrameEditor(frame, role);
check('節點面板開著時，機架面板成為節點面板的子元素', frame.parentNode === role);
check('收進去時 dataset.embedded 為 "true"', frame.dataset.embedded === 'true');

// 2. 重複呼叫不重複插入、不改順序
Panels.placeFrameEditor(frame, role);
check('重複呼叫仍只有一份', role.children.filter(c => c === frame).length === 1);

// 3. 模組列已搬進節點面板時，機架段落排在模組列之前（模組列永遠在最底）
role.appendChild(moduleRow);
role.appendChild(frame);   // 模擬先前順序錯誤：機架在模組列之後
Panels.placeFrameEditor(frame, role);
check('機架段落排在模組列之前', role.children.indexOf(frame) < role.children.indexOf(moduleRow));
container.insertBefore(moduleRow, role);   // 還原模組列

// 4. 節點面板關閉 → 回到容器、緊接在節點面板之後，取消 embedded
role.style.display = 'none';
Panels.placeFrameEditor(frame, role);
check('節點面板關閉時，機架面板回到原容器', frame.parentNode === container);
check('回到節點面板正後方（原本位置）', role.nextSibling === frame);
check('獨立時 dataset.embedded 不是 "true"', frame.dataset.embedded !== 'true');

// 5. 與 updateFrameEditor / updateRoleEditor 整合
const pts = { A: { x: 0, y: 0 }, B: { x: 100, y: 0 }, C: { x: 40, y: 60 } };
Panels.init({
  pointCoords: () => pts, sliderMountInfo: () => null, roleLabel: () => '機架點',
  triParamFor: () => '', hasPoint: id => id in pts, motorBarForCenter: () => null,
  pointUseCount: () => 1, pointIsGround: id => id === 'A' || id === 'B',
  isGroundPositionUnlocked: () => false
});
S.selectedNodeId = 'A'; S.frameEditorOpen = true;
Panels.updateRoleEditor();
check('選機架點：節點面板顯示', role.style.display !== 'none');
check('選機架點：機架面板顯示', frame.style.display === 'flex');
check('選機架點：機架面板在節點面板內', frame.parentNode === role && frame.dataset.embedded === 'true');

S.selectedNodeId = null;
Panels.updateRoleEditor();
check('取消選取：節點面板隱藏', role.style.display === 'none');
check('取消選取：機架面板回到獨立位置', frame.parentNode === container && frame.dataset.embedded !== 'true');

// 只開機架（例如從機架把手開啟），沒有選接點：維持獨立面板
S.frameEditorOpen = true;
Panels.updateFrameEditor();
check('只開機架：獨立顯示，不塞進隱藏的節點面板', frame.style.display === 'flex' && frame.parentNode === container);

report('panel-stacking');
