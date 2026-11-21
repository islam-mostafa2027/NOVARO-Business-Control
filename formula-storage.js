/* NOVARO Formula Storage
 * Stores formulas separately from operational values in formula_cells.
 * Authorization is enforced by database grants and source-aware RLS policies.
 */
(function(root){
 "use strict";
 function validateCellId(cellId,cellMap,adapter){
  if(typeof cellId!=="string"||!cellId)throw new Error("معرّف الخلية غير صالح");
  if(!cellMap||typeof cellMap.decode!=="function"||!adapter||typeof adapter.describeCell!=="function")throw new Error("مكوّنات المعادلات غير متاحة");
  return adapter.describeCell(cellId,cellMap);
 }
 function validateFormula(formula,engine){
  if(typeof formula!=="string"||formula.length>4000||!formula.trim().startsWith("="))throw new Error("المعادلة يجب أن تبدأ بعلامة = وألا تتجاوز 4000 حرف");
  if(!engine||typeof engine.getDependencies!=="function")throw new Error("محرك المعادلات غير متاح");
  // Validate the full expression before persistence using harmless placeholder values.
  // Real source values and permissions are still resolved only by the runtime.
  const dependencies=engine.getDependencies(formula);
  const preview=engine.evaluate(formula,{
   getCell:()=>0,
   getCellById:()=>0,
   getRange:()=>[0]
  });
  if(typeof preview!=="number"||!Number.isFinite(preview))throw new Error("يجب أن تُرجع المعادلة رقمًا صالحًا");
  return dependencies;
 }
 async function loadFormulas(cellIds,db,cellMap,adapter){
  if(!Array.isArray(cellIds)||cellIds.length>300)throw new Error("قائمة خلايا المعادلات غير صالحة");
  if(!db||typeof db.from!=="function")throw new Error("اتصال قاعدة البيانات غير متاح");
  const ids=[...new Set(cellIds)];
  for(const id of ids)validateCellId(id,cellMap,adapter);
  if(!ids.length)return Object.freeze({});
  const result=await db.from("formula_cells").select("cell_id,formula").in("cell_id",ids);
  if(result?.error)throw result.error;
  const formulas={};
  for(const row of result?.data||[]){
   if(typeof row?.cell_id==="string"&&typeof row?.formula==="string")formulas[row.cell_id]=row.formula;
  }
  return Object.freeze(formulas);
 }
 async function saveFormula(cellId,formula,db,cellMap,adapter,engine){
  validateCellId(cellId,cellMap,adapter);
  validateFormula(formula,engine);
  if(!db||typeof db.from!=="function")throw new Error("اتصال قاعدة البيانات غير متاح");
  const result=await db.from("formula_cells").upsert(
   {cell_id:cellId,formula:formula.trim()},
   {onConflict:"cell_id"}
  );
  if(result?.error)throw result.error;
  return true;
 }
 async function removeFormula(cellId,db,cellMap,adapter){
  validateCellId(cellId,cellMap,adapter);
  if(!db||typeof db.from!=="function")throw new Error("اتصال قاعدة البيانات غير متاح");
  const result=await db.from("formula_cells").delete().eq("cell_id",cellId);
  if(result?.error)throw result.error;
  return true;
 }
 const api=Object.freeze({loadFormulas,saveFormula,removeFormula});
 root.NOVAROFormulaStorage=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
