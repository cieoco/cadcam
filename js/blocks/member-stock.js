// Shared physical stock metadata for rigid bar and plate members.
// This is descriptive data only; it does not make strength or fabrication claims.

export const MATERIALS = Object.freeze([
  Object.freeze({ id: 'unspecified', label: '未指定' }),
  Object.freeze({ id: 'plywood', label: '夾板' }),
  Object.freeze({ id: 'acrylic', label: '壓克力' }),
  Object.freeze({ id: 'aluminum', label: '鋁板' }),
  Object.freeze({ id: 'pla', label: 'PLA' }),
]);

const MATERIAL_IDS = new Set(MATERIALS.map(item => item.id));
const DEFAULT_STOCK = Object.freeze({ widthMm: 18, thicknessMm: 4, material: 'unspecified' });

function finiteInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundTenth(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function normalizedDimension(value, fallback, min, max) {
  const number = finiteInput(value);
  return number === null ? fallback : roundTenth(Math.min(max, Math.max(min, number)));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeMemberStock(raw) {
  if (!isRecord(raw)) return undefined;
  return {
    widthMm: normalizedDimension(raw.widthMm, DEFAULT_STOCK.widthMm, 2, 120),
    thicknessMm: normalizedDimension(raw.thicknessMm, DEFAULT_STOCK.thicknessMm, 0.5, 30),
    material: MATERIAL_IDS.has(raw.material) ? raw.material : DEFAULT_STOCK.material,
  };
}

export function memberStock(comp) {
  const normalized = normalizeMemberStock(isRecord(comp) ? comp.stock : undefined);
  return normalized || { ...DEFAULT_STOCK };
}

export function memberStockLabel(comp) {
  const stock = memberStock(comp);
  const material = MATERIALS.find(item => item.id === stock.material)?.label || '未指定';
  const format = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${material}・板寬 ${format(stock.widthMm)} mm・厚度 ${format(stock.thicknessMm)} mm`;
}

export function planMemberStock(comp, key, raw, { holeDiameterMm = 12.96 } = {}) {
  if (!['widthMm', 'thicknessMm', 'material'].includes(key)) {
    return { ok: false, message: '不支援的實體資料欄位。' };
  }

  const stock = memberStock(comp);
  if (key === 'material') {
    if (typeof raw !== 'string' || !MATERIAL_IDS.has(raw)) {
      return { ok: false, message: '請選擇有效的材料標籤。' };
    }
    return { ok: true, stock: { ...stock, material: raw } };
  }

  const value = finiteInput(raw);
  if (value === null) return { ok: false, message: '請輸入有限的數值。' };

  const [min, max] = key === 'widthMm' ? [2, 120] : [0.5, 30];
  if (value < min || value > max) {
    return { ok: false, message: `${key === 'widthMm' ? '板寬' : '厚度'}須介於 ${min}–${max} mm。` };
  }

  const rounded = roundTenth(value);
  if (key === 'widthMm') {
    const hole = finiteInput(holeDiameterMm);
    const minWidth = (hole === null ? 12.96 : hole) + 0.5;
    if (value < minWidth || rounded < minWidth) {
      return { ok: false, message: `板寬不得小於連接孔直徑加 0.5 mm（目前至少 ${Math.ceil(minWidth * 10) / 10} mm）。` };
    }
  }

  return { ok: true, stock: { ...stock, [key]: rounded } };
}

export function memberHoleDiameter(comp, settings = {}) {
  const connection = finiteInput(settings.holeDiameterMm) ?? 12.96;
  return comp?.type === 'bar' && comp.isInput && comp.motorType !== 'mg995'
    ? Math.max(connection, finiteInput(settings.ttShaftFlatDiameterMm) ?? 5.4) : connection;
}

// 匯入舊檔或稍後放大全域孔徑仍可能讓孔超出板寬；匯出前明確攔下，不偷偷改孔。
export function memberStockWarnings(comps, settings = {}) {
  return comps.filter(c => ['bar', 'triangle'].includes(c.type) && memberStock(c).widthMm < memberHoleDiameter(c, settings) + 0.5)
    .map(c => `${c.id} 板寬不足以容納目前孔徑與 0.5 mm 留量；請增加板寬或縮小連接孔。`);
}
