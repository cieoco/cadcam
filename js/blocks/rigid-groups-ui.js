import { rigidGroupInterface, createRigidGroupInterfaceSession } from './rigid-group-interface.js';
import { S } from './state.js';
import { rigidGroupCandidates, inspectRigidGroup, createRigidGroup, dissolveRigidGroup } from './rigid-groups.js';

/** 組立模式的單層群組入口。板件仍交回原設計／接合工具編輯。 */
export function createRigidGroupsUI(h) {
  let selected = '', editing = false, signature = '', pending = null;
  const session = createRigidGroupInterfaceSession({ getSnapshot: h.getSnapshot, applySnapshot: h.applySnapshot });
  function prepare(entry, action, target) {
    if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
    h.pause();
    const result = session.prepare({ operationVersion: 1, action, hostId: entry.host.id, groupId: entry.group.id, ...(target ? { target } : {}) });
    if (!result.ok) { h.say(result.issues[0].message); return; }
    pending = { action, key: entry.key }; signature = ''; h.sync();
  }
  const entries = () => S.modules.flatMap(m => (m.rigidGroups || []).map(g => ({ host: m, group: g, key: `${m.id}/${g.id}` })));
  const current = () => entries().find(e => e.key === selected);
  const button = (text, action) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.onclick = action; return b;
  };
  const changed = result => {
    if (!result.ok) { h.say(result.reason); return; }
    h.pushUndo(); S.modules = result.modules; signature = ''; h.rebuild(); h.draw(); h.sync();
  };
  function render() {
    const list = document.getElementById('benchList');
    if (!list) return;
    let box = document.getElementById('rigidGroups');
    if (!box) { box = document.createElement('section'); box.id = 'rigidGroups'; box.setAttribute('aria-label', '剛性群組'); list.prepend(box); }
    const all = entries(), active = current();
    if (!active) { selected = ''; editing = false; }
    const candidates = rigidGroupCandidates(S.comps, S.modules);
    const sig = JSON.stringify([S.comps, S.modules, selected, editing, pending, h.busy()]);
    if (sig !== signature) {
      signature = sig; box.replaceChildren(); box.hidden = !all.length && !candidates.length;
      for (const entry of all) {
        const { host, group, key } = entry;
        const check = inspectRigidGroup(S.comps, S.modules, host.id, group);
        const row = document.createElement('div'); row.className = 'rigid-group-row';
        const choose = button(`${group.name} · ${group.members.length + 1} 板${check.ok ? '' : ' ⚠'}`, () => {
          if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
          selected = key; editing = false; h.clearSelection(); h.sync();
        });
        choose.setAttribute('aria-pressed', String(selected === key)); row.append(choose); box.append(row);
        if (selected !== key) continue;
        const controls = document.createElement('div'); controls.className = 'rigid-group-actions';
        controls.append(button(editing ? '完成群組編輯' : '編輯群組', () => {
          if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
          editing = !editing; h.clearSelection(); h.sync();
        }));
        controls.append(button('解散群組', () => {
          if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
          changed(dissolveRigidGroup(S.modules, host.id, group.id));
        }));
        box.append(controls);
        if (check.ok && !editing) {
          const info = rigidGroupInterface(S.comps, S.modules, host.id, group.id);
          const mount = document.createElement('div'); mount.className = 'rigid-group-actions';
          if (pending?.key === key) {
            const note = document.createElement('p');
            note.textContent = ({ extract: '將基準板獨立，支架與馬達留在原模組。', detach: '整組回到設計姿態並拆下；內部接合保留。', attach: '以基準孔接到所選輸出端，回到參考姿態。' })[pending.action];
            mount.append(note, button('確認', () => {
              const result = session.confirm(); pending = null;
              if (result.ok) { selected = `${result.hostId}/${result.groupId}`; editing = false; h.say('群組操作完成，可復原'); }
              else h.say(result.issues[0].message);
              signature = ''; h.sync();
            }), button('取消', () => { session.cancel(); pending = null; signature = ''; h.sync(); }));
          } else if (!info.independent) mount.append(button('獨立為可安裝群組', () => prepare(entry, 'extract')));
          else if (info.mode === 'coplanar' && info.mounted) mount.append(button('拆下並回位', () => prepare(entry, 'detach')));
          else if (info.mode === 'coplanar') {
            const targets = document.createElement('select'); targets.setAttribute('aria-label', '群組安裝輸出端');
            S.modules.filter(m => m.id !== host.id && !group.members.includes(m.id)).forEach(m => (m.outputs || []).forEach(o => {
              const option = document.createElement('option'); option.value = JSON.stringify({ module: m.id, output: o.id }); option.textContent = `${m.name || m.id}／${o.name || o.id}`; targets.append(option);
            }));
            const attach = button('準備安裝', () => prepare(entry, 'attach', JSON.parse(targets.value))); attach.disabled = !targets.options.length;
            mount.append(targets, attach);
          }
          box.append(mount);
        }
        if (!check.ok) { const p = document.createElement('p'); p.textContent = check.reason; box.append(p); }
        if (editing) {
          const pieces = document.createElement('div'); pieces.className = 'rigid-group-actions';
          const pick = document.createElement('select'); pick.setAttribute('aria-label', '編輯群組板件');
          [host.id, ...group.members].forEach(id => {
            const option = document.createElement('option'); option.value = id;
            option.textContent = id === host.id ? '基準板' : S.modules.find(m => m.id === id)?.name || id;
            pick.append(option);
          });
          pieces.append(pick, button('編輯板件', () => {
            if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
            h.edit(pick.value);
          }));
          box.append(pieces);
        }
      }
      if (candidates.length) {
        const details = document.createElement('details'), summary = document.createElement('summary');
        summary.textContent = '＋ 建立剛性群組'; details.append(summary);
        const select = document.createElement('select'); select.setAttribute('aria-label', '群組基準板');
        candidates.forEach((c, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `${c.group.name} · ${c.plateCount} 板`; select.append(o); });
        const name = document.createElement('input'); name.placeholder = '群組名稱'; name.maxLength = 40; name.setAttribute('aria-label', '群組名稱');
        details.append(select, name, button('成組', () => {
          if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
          const c = candidates[Number(select.value)];
          const result = createRigidGroup(S.comps, S.modules, c.hostId, c.group.output, name.value);
          if (result.ok) { selected = `${c.hostId}/${result.group.id}`; editing = false; h.clearSelection(); }
          changed(result);
        })); box.append(details);
      }
    }
    // 收合群組只隱藏其結構板列；包含馬達／支架的宿主模組保持獨立。
    const hidden = new Set(all.filter(e => !(e.key === selected && editing)).flatMap(e => rigidGroupInterface(S.comps, S.modules, e.host.id, e.group.id).independent ? [e.host.id, ...e.group.members] : e.group.members));
    list.querySelectorAll('[data-module]').forEach(row => { row.hidden = hidden.has(row.dataset.module); });
    const panel = document.getElementById('benchPanel');
    if (panel) panel.hidden = !!current() && !editing;
  }
  return {
    render,
    reset() { selected = ''; editing = false; signature = ''; pending = null; session.cancel(); },
    memberSelected(id) {
      const entry = entries().find(e => e.group.members.includes(id));
      if (entry && !editing) { selected = entry.key; return true; }
      if (!editing) selected = '';
      return false;
    },
    keys() {
      const entry = current(); if (!entry || editing) return [];
      const check = inspectRigidGroup(S.comps, S.modules, entry.host.id, entry.group);
      if (!check.ok) return [];
      const c = check.body;
      const prefix = entry.host.mount?.face || entry.host.mount?.orient ? `${entry.host.id}/` : '';
      return [prefix + (c.type === 'triangle' ? `plate:${c.p1.id}-${c.p2.id}-${c.p3.id}` : `stick:${c.id}`), ...entry.group.members.map(id => `${id}/*`)];
    }
  };
}
