import { closedAssemblyIds } from './assembly-view.js';
import { rigidGroupInterface, createRigidGroupInterfaceSession } from './rigid-group-interface.js';
import { S } from './state.js';
import { rigidComponents, nameRigidComponent, inspectRigidGroup, dissolveRigidGroup } from './rigid-groups.js';

/** 組立模式的單層群組入口。板件仍交回原設計／接合工具編輯。 */
export function createRigidGroupsUI(h) {
  let selected = '', editing = false, signature = '', pending = null;
  const session = createRigidGroupInterfaceSession({ getSnapshot: h.getSnapshot, applySnapshot: h.applySnapshot });
  function prepare(entry, action, target, faceGapMm) {
    if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
    h.pause();
    const result = session.prepare({ operationVersion: 1, action, hostId: entry.host.id, groupId: entry.group.id, ...(target ? { target, ...(faceGapMm !== undefined ? {faceGapMm} : {}) } : {}) });
    if (!result.ok) { h.say(result.issues[0].message); return; }
    pending = { action, key: entry.key }; signature = ''; h.sync();
  }
  const entries = () => rigidComponents(S.comps,S.modules).filter(e=>!closedAssemblyIds(S.modules).has(e.host.id));
  const current = () => entries().find(e => e.key === selected);
  const button = (text, action) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.style.minHeight='44px';b.onclick = action; return b;
  };
  const changed = result => {
    if (!result.ok) { h.say(result.reason); return; }
    h.pushUndo(); S.modules = result.modules; signature = ''; h.rebuild(); h.draw(); h.sync();
  };
  function rename(entry) {
    if(h.busy()) {h.say('請先確認或取消接合預覽');return;}
    h.pause();
    const original=JSON.stringify([S.comps,S.modules]);
    const dialog=document.createElement('dialog');dialog.id='componentNameDialog';
    dialog.style.cssText='width:min(360px,calc(100vw - 64px));border:1px solid #bacddd;border-radius:12px;padding:20px;';
    const form=document.createElement('form'),title=document.createElement('h3');title.textContent='命名組件';
    const input=document.createElement('input');input.value=entry.saved?entry.group.name:'';input.placeholder='例如：料斗';input.required=true;input.maxLength=40;input.setAttribute('aria-label','組件名稱');input.style.cssText='box-sizing:border-box;width:100%;padding:10px;font-size:16px;';
    const error=document.createElement('p');error.setAttribute('role','status');
    const cancel=button('取消',()=>dialog.close());
    const submit=document.createElement('button');submit.type='submit';submit.textContent='確認名稱';submit.style.minHeight='44px';
    form.append(title,input,error,cancel,submit);dialog.append(form);
    form.onsubmit=e=>{e.preventDefault();if(original!==JSON.stringify([S.comps,S.modules])){error.textContent='作品已變更，請取消後重新選取組件';return;}const result=nameRigidComponent(S.comps,S.modules,entry.host.id,entry.group.output,input.value);if(!result.ok){error.textContent=result.reason;return;}selected=`${entry.host.id}/${result.group.id}`;dialog.close();changed(result);};
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();input.focus();input.select();
  }
  function render() {
    const list = document.getElementById('benchList');
    if (!list) return;
    let box = document.getElementById('rigidGroups');
    if (!box) { box = document.createElement('section'); box.id = 'rigidGroups'; box.setAttribute('aria-label', '組件'); list.prepend(box); }
    const all = entries(), active = current();
    if (!active) { selected = ''; editing = false; }

    const sig = JSON.stringify([S.comps, S.modules, selected, editing, pending, h.busy(), [...closedAssemblyIds(S.modules)]]);
    if (sig !== signature) {
      signature = sig; box.replaceChildren(); box.hidden = !all.length;
      for (const entry of all) {
        const { host, group, key } = entry;
        const check = inspectRigidGroup(S.comps, S.modules, host.id, group);
        const row = document.createElement('div'); row.className = 'rigid-group-row';
        const choose = button(`${entry.saved?group.name:"固定組件"} · ${group.members.length + 1} 板${check.ok ? '' : ' ⚠'}`, () => {
          if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
          selected = key; editing = false; h.clearSelection(); h.sync();
        });
        choose.setAttribute('aria-pressed', String(selected === key)); row.append(choose); box.append(row);
        if (selected !== key) continue;
        const controls = document.createElement('div'); controls.className = 'rigid-group-actions';
        controls.append(button(editing ? '完成編輯' : '編輯組件', () => {
          if (h.busy()) { h.say('請先確認或取消接合預覽'); return; }
          editing = !editing; h.clearSelection(); h.sync();
        }));
        controls.append(button(entry.saved?'重新命名':'命名組件',()=>rename(entry)));
        box.append(controls);
        const more=document.createElement('details');more.className='component-more';
        const summary=document.createElement('summary');summary.textContent='更多';more.append(summary);
        if(entry.saved)more.append(button('取消群組記錄（保留接合）',()=>{
          if(h.busy()){h.say('請先確認或取消接合預覽');return;}
          changed(dissolveRigidGroup(S.modules,host.id,group.id));
        }));
        if(entry.saved)box.append(more);
        if (entry.saved && check.ok && !editing) {
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
          } else if (!info.independent) mount.append(button('準備移裝組件', () => prepare(entry, 'extract')));
          else if (!info.host.mount?.orient && info.mounted) mount.append(button('拆下並回位', () => prepare(entry, 'detach')));
          else if (info.mode === 'coplanar') {
            const targets = document.createElement('select'); targets.setAttribute('aria-label', '群組安裝輸出端');
            S.modules.filter(m => m.id !== host.id && !group.members.includes(m.id)).forEach(m => (m.outputs || []).forEach(o => {
              const option = document.createElement('option'); option.value = JSON.stringify({ module: m.id, output: o.id }); option.textContent = `${m.name || m.id}／${o.name || o.id}`; targets.append(option);
            }));
            const gap=Number(S.topo.params.liftBucket)===1?document.createElement('input'):null;
            if(gap){gap.type='number';gap.min='0';gap.max='50';gap.value='12';gap.setAttribute('aria-label','板面間距（mm）');const label=document.createElement('label');label.textContent='板面間距（mm）';label.append(gap);mount.append(label);}
            const attach = button('準備安裝', () => prepare(entry, 'attach', JSON.parse(targets.value), gap ? Number(gap.value) : undefined)); attach.disabled = !targets.options.length;
            mount.append(targets, attach);
          }
          if(pending?.key===key)box.append(mount);else more.append(mount);
        }
        if (!check.ok) { const p = document.createElement('p'); p.textContent = check.reason; box.append(p); }
        if (editing) {
          const pieces = document.createElement('div'); pieces.className = 'rigid-group-actions';
          const pick = document.createElement('select'); pick.setAttribute('aria-label', '組件內板件');
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
    }
    // 收合群組只隱藏其結構板列；包含馬達／支架的宿主模組保持獨立。
    const hidden = new Set(all.filter(e => !(e.key === selected && editing)).flatMap(e => (e.saved && rigidGroupInterface(S.comps, S.modules, e.host.id, e.group.id).independent) ? [e.host.id, ...e.group.members] : e.group.members));
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
