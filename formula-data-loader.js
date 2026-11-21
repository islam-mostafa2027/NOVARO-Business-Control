/* NOVARO Formula Data Loader
 * Fetches referenced source cells through the user's Supabase client.
 * All reads remain subject to the source tables' existing RLS policies.
 * This module never writes to business tables or uses privileged credentials.
 */
(function(root){
 "use strict";
 async function loadCells(cellIds,db,cellMap,adapter){
  if(!Array.isArray(cellIds)||cellIds.length>300)throw new Error("قائمة مراجع المعادلات غير صالحة أو أكبر من الحد المسموح");
  if(!db||typeof db.from!=="function")throw new Error("اتصال قاعدة البيانات غير متاح");
  if(!adapter||typeof adapter.describeCell!=="function"||typeof adapter.extractValue!=="function")throw new Error("محوّل مصادر المعادلات غير متاح");
  const descriptors=new Map();
  for(const id of new Set(cellIds)){
   if(typeof id!=="string")throw new Error("مرجع خلية غير صالح");
   descriptors.set(id,adapter.describeCell(id,cellMap));
  }
  const groups=new Map();
  for(const d of descriptors.values()){
   const filters=Object.entries(d.filters).sort(([a],[b])=>a.localeCompare(b));
   // The branch is encoded in an inventory cell ID but lives on the related
   // session row. Include it in the query itself to prevent cross-branch ID spoofing.
   if(d.type==="inventory_count") filters.push(["inventory_sessions.branch_id",d.branchId]);
   const key=JSON.stringify([d.table,filters]);
   let group=groups.get(key);
   if(!group){group={table:d.table,filters,columns:new Set(),descriptors:[]};groups.set(key,group);}
   for(const column of (d.columns||[d.column]))group.columns.add(column);
   group.descriptors.push(d);
  }
  const values={};
  await Promise.all([...groups.values()].map(async group=>{
   const columns=[...group.columns].sort();
   const selectColumns=group.descriptors[0]?.type==="inventory_count"
    ?columns.join(",")+",inventory_sessions!inner(branch_id)"
    :columns.join(",");
   let query=db.from(group.table).select(selectColumns);
   for(const [column,value] of group.filters)query=query.eq(column,value);
   const result=await query.maybeSingle();
   if(result?.error)throw result.error;
   for(const d of group.descriptors)values[d.cellId]=adapter.extractValue(d,result?.data??null);
  }));
  return Object.freeze(values);
 }
 const api=Object.freeze({loadCells});
 root.NOVAROFormulaDataLoader=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
