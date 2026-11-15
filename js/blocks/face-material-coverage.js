/** Bad machining does not invalidate a known pose; fastening remains strict. */
export const machiningOutsideMaterial = row => row?.reason === 'unassigned_machining_feature' && !!row.partId && !!row.pickKey;
export const nonBlockingMaterialCoverage = (row,positioning=false) => positioning && machiningOutsideMaterial(row) || row?.code === 'material_kind_not_supported' && row.kind === 'syringe' || row?.code === 'material_representation_not_supported' && ['motors','pins','grounds'].includes(row.kind);
