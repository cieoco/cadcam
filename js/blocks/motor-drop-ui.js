import {planMotorDrop,planPlacedMotorOutput,planDraggedMotorOutput} from './motor-drop.js';
import {isFreeBody} from './model.js';
import {retargetPointRefs} from './topo-refs.js';
import {mountingWork,confirmMountingChange} from './mounting-review-ui.js';

// The drag has already recorded its single undo. Finish the same operation only
// if nothing has changed during lazy loading; never overwrite a later edit/undo.
export function mountDroppedMotor({S,id,expected,snapshotStr,displayCoords,rebuild,draw,notify,updateRoleEditor}){
 if(snapshotStr()!==expected)return;
 const motor=S.comps.find(c=>c.id===id&&c.type==='motor');if(!motor||!isFreeBody(S.comps,motor,S.modules))return;
 const mount=motor.motorMount||{},source=mountingWork(S);
 const result=planMotorDrop(source,{...mount,type:motor.motorType,existingId:id,position:{...motor.p1},start:motor.servoStart,end:motor.servoEnd},displayCoords(),{thetaDeg:S.theta,motorAngles:S.motorAngles});
 if(!result.matched)return;
 if(!result.ok){notify(`未安裝：${result.message}`);return;}
 if(!confirmMountingChange(source,{...source,comps:result.comps,params:result.params},{notify}))return;
 S.comps=result.comps;S.topo.params=result.params;S.selectedNodeId=result.center;
 rebuild();draw();updateRoleEditor();notify(`已固定在${result.hostName}，安裝孔槽已更新；可復原。`);
}

export function connectPlacedMotorOutput({S,id,expected,snapshotStr,displayCoords,rebuild,draw,notify,selectLink}){
 if(snapshotStr()!==expected)return;
 const source=mountingWork(S),result=planPlacedMotorOutput(source,id,displayCoords(),{thetaDeg:S.theta,motorAngles:S.motorAngles});
 if(!result.matched)return;
 if(!result.ok){notify(`桿件已放置，尚未接成動力輸出：${result.message}`);return;}
 if(!confirmMountingChange(source,{...source,comps:result.comps,params:result.params},{notify}))return;
 S.comps=result.comps;S.topo.params=result.params;
 rebuild();draw();selectLink(id);notify('已接上動力輸出；可復原或在安裝設定解除連接。');
}

export function connectDraggedMotorOutput({S,fromId,toId,candidate,points,before,expected,snapshotStr,rebuild,draw,notify,selectLink,updateUndoBtn}){
 if(snapshotStr()!==expected||S.dragId||S.dragLinkId)return;
 const source=mountingWork(S),result=planDraggedMotorOutput(candidate,fromId,toId,points,{thetaDeg:S.theta,motorAngles:S.motorAngles});
 if(!result.ok){notify(`尚未接上動力輸出：${result.message||'找不到輸出軸。'}`);return;}
 if(!confirmMountingChange(source,{...source,comps:result.comps,params:result.params},{notify}))return;
 S.undoStack.push(before);if(S.undoStack.length>60)S.undoStack.shift();updateUndoBtn(true);
 S.comps=result.comps;S.topo.params=result.params;S.selectedNodeId=result.center;retargetPointRefs(S.topo,fromId,toId);
 rebuild();draw();selectLink(result.outputId);notify('已接上動力輸出；可復原或解除連接。');
}
