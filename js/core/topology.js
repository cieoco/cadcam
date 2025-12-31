/**
 * Topology Compiler
 * 將 Wizard 組件轉換為可求解的拓撲結構
 */

export function compileTopology(components, topology, solvedPoints) {
    const steps = [];
    const visualization = { links: [], polygons: [], joints: [] };
    const params = (topology && topology.params) ? topology.params : { theta: 0 };
    const joints = new Set();
    const polygons = [];
    const allPointsMap = new Map();

    if (topology) topology.bodyJoint = true;

    // 收集座標與屬性 (智慧合併：fixed/input 優先權高於 existing)
    components.forEach(c => {
        if (c.type === 'polygon' && c.points) {
            c.points.forEach(p => {
                if (p.id) {
                    const existing = allPointsMap.get(p.id);
                    const isStronger = (p.type === 'fixed');
                    const isEmpty = !existing || existing.type === 'existing';

                    if (isStronger || isEmpty || (p.x !== undefined && existing?.x === undefined)) {
                        allPointsMap.set(p.id, {
                            x: p.x ?? existing?.x,
                            y: p.y ?? existing?.y,
                            type: (isStronger ? p.type : (existing?.type || p.type))
                        });
                    }
                }
            });
        } else {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].id) {
                    const existing = allPointsMap.get(c[k].id);
                    // 只有當新屬性更「強」(例如 fixed) 或者舊屬性是空的/existing 時，才更新
                    const isStronger = (c[k].type === 'fixed' || (c[k].type === 'input' && (!existing || existing.type !== 'fixed')));
                    const isEmpty = !existing || existing.type === 'existing';

                    if (isStronger || isEmpty || (c[k].x !== undefined && existing?.x === undefined)) {
                        allPointsMap.set(c[k].id, {
                            x: c[k].x ?? existing?.x,
                            y: c[k].y ?? existing?.y,
                            type: (isStronger ? c[k].type : (existing?.type || c[k].type))
                        });
                    }
                }
            });
        }
    });

    // 1. Ground 步驟
    allPointsMap.forEach((info, id) => {
        if (info.type === 'fixed') {
            const step = { id, type: 'ground', x: parseFloat(info.x) || 0, y: parseFloat(info.y) || 0 };

            // 檢查是否有連桿連接此固定點與另一個「已處理過」的固定點
            // 1. Check for Bar
            let groundLink = components.find(c => {
                if (c.type !== 'bar' || !c.lenParam) return false;
                if (c.p1.id !== id && c.p2.id !== id) return false;
                const otherId = (c.p1.id === id) ? c.p2.id : c.p1.id;
                const otherPt = allPointsMap.get(otherId);
                return otherPt && otherPt.type === 'fixed' && steps.find(s => s.id === otherId);
            });

            // 2. Check for Triangle Base (P1-P2)
            if (!groundLink) {
                groundLink = components.find(c => {
                    if (c.type !== 'triangle' || !c.gParam) return false;
                    if (c.p1.id !== id && c.p2.id !== id) return false;
                    const otherId = (c.p1.id === id) ? c.p2.id : c.p1.id;
                    if ((c.p1.id === id && c.p2.id === otherId) || (c.p2.id === id && c.p1.id === otherId)) {
                        const otherPt = allPointsMap.get(otherId);
                        return otherPt && otherPt.type === 'fixed' && steps.find(s => s.id === otherId);
                    }
                    return false;
                });
            }

            // 3. Check for Slider Track (P1-P2)
            if (!groundLink) {
                groundLink = components.find(c => {
                    if (c.type !== 'slider' || !c.lenParam) return false;
                    if (c.p1.id !== id && c.p2.id !== id) return false;
                    const otherId = (c.p1.id === id) ? c.p2.id : c.p1.id;
                    const otherPt = allPointsMap.get(otherId);
                    return otherPt && otherPt.type === 'fixed' && steps.find(s => s.id === otherId);
                });
            }

            if (groundLink) {
                const otherId = (groundLink.p1.id === id) ? groundLink.p2.id : groundLink.p1.id;
                const otherPt = allPointsMap.get(otherId);
                if (otherPt) {
                    const dx = info.x - otherPt.x;
                    const dy = info.y - otherPt.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 0) {
                        step.dist_param = (groundLink.type === 'triangle') ? groundLink.gParam : groundLink.lenParam;
                        step.ref_id = otherId;
                        step.ux = dx / dist;
                        step.uy = dy / dist;
                        delete step.x;
                        delete step.y;
                    }
                }
            }

            steps.push(step);
            joints.add(id);
        }
    });

    // Prepare Virtual Components for Polygons
    const virtualComponents = [...components];
    components.forEach(c => {
        if (c.type === 'polygon' && c.points && c.points.length >= 3) {
            for (let i = 0; i < c.points.length; i++) {
                const p1 = c.points[i];
                const p2 = c.points[(i + 1) % c.points.length];
                virtualComponents.push({
                    type: 'bar',
                    id: `${c.id}_edge_${i}`,
                    p1: p1,
                    p2: p2,
                    lenParam: `${c.id}_L${i + 1}`,
                    isVirtual: true
                });
            }
            for (let i = 2; i < c.points.length - 1; i++) {
                const p1 = c.points[0];
                const p2 = c.points[i];
                virtualComponents.push({
                    type: 'bar',
                    id: `${c.id}_diag_${i}`,
                    p1: p1,
                    p2: p2,
                    lenParam: `${c.id}_D${i}`,
                    isVirtual: true
                });
            }

            polygons.push({
                points: c.points.map(p => p.id),
                color: c.color || '#e67e22'
            });
        }
    });

    // 2. Input Crank 步驟
    virtualComponents.filter(c => c.type === 'bar' && c.isInput).forEach(c => {
        if (c.p1?.id && c.p2?.id && solvedPoints.has(c.p1.id)) {
            steps.push({
                id: c.p2.id,
                type: 'input_crank',
                center: c.p1.id,
                len_param: c.lenParam,
                phase_offset: c.phaseOffset || 0
            });
            joints.add(c.p2.id);
        }
    });

    // Auto-Dyad Inference
    const bars = virtualComponents.filter(c => c.type === 'bar' && !c.isInput);
    const unsolvedJoints = Array.from(allPointsMap.keys()).filter(id => !steps.find(s => s.id === id));

    unsolvedJoints.forEach(jId => {
        const relatedBars = bars.filter(b => b.p1.id === jId || b.p2.id === jId);
        if (relatedBars.length >= 2) {
            const solvableConnections = relatedBars.filter(b => {
                const otherId = (b.p1.id === jId ? b.p2.id : b.p1.id);
                return steps.find(s => s.id === otherId);
            });

            if (solvableConnections.length >= 2) {
                const b1 = solvableConnections[0];
                const b2 = solvableConnections[1];
                const p1Id = (b1.p1.id === jId ? b1.p2.id : b1.p1.id);
                const p2Id = (b2.p1.id === jId ? b2.p2.id : b2.p1.id);

                if (!steps.find(s => s.id === jId)) {
                    steps.push({
                        id: jId,
                        type: 'dyad',
                        p1: p1Id, r1_param: b1.lenParam,
                        p2: p2Id, r2_param: b2.lenParam,
                        sign: 1
                    });
                    joints.add(jId);
                }
            }
        }
    });

    // 3. Dyad 步驟 (Triangle) & Nested Holes
    components.forEach(c => {
        if (c.type === 'slider' && c.p1?.id && c.p2?.id && c.p3?.id) {
            const sliderId = c.p3.id;
            const driver = c.driverId
                ? components.find(b => b.id === c.driverId && b.type === 'bar')
                : components.find(b => b.type === 'bar' && b.lenParam && (b.p1?.id === sliderId || b.p2?.id === sliderId));
            if (driver) {
                const otherId = driver.p1.id === sliderId ? driver.p2.id : driver.p1.id;
                steps.push({
                    id: sliderId,
                    type: 'slider',
                    p1: otherId,
                    r_param: driver.lenParam,
                    line_p1: c.p1.id,
                    line_p2: c.p2.id,
                    sign: c.sign || 1
                });
                joints.add(sliderId);
            } else {
                steps.push({ id: sliderId, type: 'joint', x: Number(c.p3.x || 0), y: Number(c.p3.y || 0) });
                joints.add(sliderId);
            }
            visualization.links.push({
                id: `${c.id}_track`,
                p1: c.p1.id,
                p2: c.p2.id,
                color: c.color || '#8e44ad',
                style: 'track'
            });
        }
        if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
            steps.push({
                id: c.p3.id, type: 'rigid_triangle', p1: c.p1.id, p2: c.p2.id,
                r1_param: c.r1Param, r2_param: c.r2Param, g_param: c.gParam, sign: c.sign || 1
            });
            polygons.push({ points: [c.p1.id, c.p2.id, c.p3.id], color: c.color, alpha: 0.3 });
            joints.add(c.p3.id);
        }

        if (c.type === 'bar' && c.holes) {
            c.holes.forEach(h => {
                steps.push({
                    id: h.id, type: 'point_on_link', p1: c.p1.id, p2: c.p2.id,
                    dist_param: h.distParam
                });
                joints.add(h.id);
            });
        }
    });

    // 4. 其他點位 (靜態顯示)
    allPointsMap.forEach((info, id) => {
        const isUsed = Array.from(joints).includes(id) ||
            components.some(c => (c.p1?.id === id || c.p2?.id === id || c.p3?.id === id));

        if (isUsed && !steps.find(s => s.id === id)) {
            steps.push({ id, type: 'joint', x: Number(info.x) || 0, y: Number(info.y) || 0 });
            joints.add(id);
        }
    });

    // 5. Links 視覺化
    components.forEach(c => {
        if (c.type === 'bar' && c.p1?.id && c.p2?.id) {
            visualization.links.push({
                id: c.id,
                p1: c.p1.id,
                p2: c.p2.id,
                color: c.color,
                style: c.isInput ? 'crank' : 'normal',
                lenParam: c.lenParam,
                hidden: Boolean(c.hidden)
            });
        } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
            if (c.gParam) {
                visualization.links.push({
                    id: `${c.id}_base`,
                    p1: c.p1.id,
                    p2: c.p2.id,
                    color: c.color,
                    lenParam: c.gParam,
                    hidden: true
                });
            }
            visualization.links.push({ p1: c.p1.id, p2: c.p3.id, color: c.color });
            visualization.links.push({ p1: c.p2.id, p2: c.p3.id, color: c.color });
            visualization.links.push({ p1: c.p1.id, p2: c.p2.id, color: c.color, style: 'dashed' });
        }
    });

    // 6. 參數收集
    components.forEach(c => {
        if (c.type === 'bar') {
            if (c.lenParam && params[c.lenParam] === undefined) {
                const p1 = allPointsMap.get(c.p1.id);
                const p2 = allPointsMap.get(c.p2.id);
                params[c.lenParam] = (p1 && p2) ? Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)) : 100;
            }
            if (c.holes) {
                c.holes.forEach(h => {
                    if (params[h.distParam] === undefined) params[h.distParam] = 50;
                });
            }
        } else if (c.type === 'slider') {
            if (c.trackLenParam && params[c.trackLenParam] === undefined) {
                const p1 = allPointsMap.get(c.p1.id);
                const p2 = allPointsMap.get(c.p2.id);
                params[c.trackLenParam] = (p1 && p2) ? Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)) : 200;
            }
            if (c.trackOffsetParam && params[c.trackOffsetParam] === undefined) {
                params[c.trackOffsetParam] = 10;
            }
        } else if (c.type === 'triangle') {
            if (c.r1Param && params[c.r1Param] === undefined) {
                const p1 = allPointsMap.get(c.p1.id);
                const p3 = allPointsMap.get(c.p3.id);
                params[c.r1Param] = (p1 && p3) ? Math.round(Math.sqrt((p3.x - p1.x) ** 2 + (p3.y - p1.y) ** 2)) : 100;
            }
            if (c.r2Param && params[c.r2Param] === undefined) {
                const p2 = allPointsMap.get(c.p2.id);
                const p3 = allPointsMap.get(c.p3.id);
                params[c.r2Param] = (p2 && p3) ? Math.round(Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2)) : 100;
            }
            if (c.gParam && params[c.gParam] === undefined) {
                const p1 = allPointsMap.get(c.p1.id);
                const p2 = allPointsMap.get(c.p2.id);
                params[c.gParam] = (p1 && p2) ? Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)) : 100;
            }
        }
    });

    return {
        steps,
        tracePoint: topology.tracePoint || Array.from(joints)[0] || '',
        visualization: { links: visualization.links, polygons, joints: Array.from(joints) },
        parts: components.map(c => {
            if (c.skipPart) return null;
            if (c.type === 'bar') {
                return {
                    id: `${c.id}(${c.lenParam})`,
                    type: 'bar',
                    len_param: c.lenParam,
                    color: c.color,
                    isInput: Boolean(c.isInput),
                    holes: c.holes ? c.holes.map(h => ({ id: h.id, dist_param: h.distParam })) : []
                };
            } else if (c.type === 'triangle') {
                return { id: c.id, type: 'triangle', len_params: [c.gParam, c.r1Param, c.r2Param], color: c.color };
            } else if (c.type === 'slider') {
                let lenVal = c.lenParam;
                if (!lenVal && c.p1 && c.p2) {
                    const p1 = allPointsMap.get(c.p1.id);
                    const p2 = allPointsMap.get(c.p2.id);
                    if (p1 && p2) {
                        lenVal = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    }
                }

                if (lenVal) {
                    return {
                        id: `${c.id}_Track`,
                        type: 'bar',
                        len_param: lenVal,
                        total_len_param: c.trackLenParam,
                        offset_param: c.trackOffsetParam,
                        isTrack: true,
                        color: c.color
                    };
                }
            }
            return null;
        }).filter(p => p),
        params,
        _wizard_data: components
    };
}
