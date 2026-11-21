/* NOVARO Formula Runtime
 * Deterministic batch recalculation over a caller-provided, permission-filtered value set.
 * It never fetches data or writes to storage; the host must supply authorized values.
 */
(function(root){
 "use strict";
 function recalculate(formulas, values, options){
  if(!formulas||typeof formulas!=="object"||Array.isArray(formulas))throw new Error("قائمة المعادلات غير صالحة");
  if(!values||typeof values!=="object"||Array.isArray(values))throw new Error("قيم الخلايا غير صالحة");
  const engine=(options&&options.engine)||root.NOVAROFormulaEngine;
  const graphApi=(options&&options.graph)||root.NOVAROFormulaDependencyGraph;
  if(!engine||typeof engine.evaluate!=="function"||typeof engine.getDependencies!=="function")throw new Error("محرك المعادلات غير متاح");
  if(!graphApi||typeof graphApi.build!=="function")throw new Error("مخطط الاعتماديات غير متاح");
  const ids=Object.keys(formulas),byId={...values},dependencies={};
  for(const id of ids)dependencies[id]=engine.getDependencies(formulas[id]);
  const graph=graphApi.build(formulas,(_,id)=>dependencies[id]);
  const results={},errors={};
  if(graph.hasCycles){
   for(const cycle of graph.cycles)for(const id of cycle)if(Object.prototype.hasOwnProperty.call(formulas,id))errors[id]="مرجع دائري: "+cycle.join(" ← ");
   return Object.freeze({values:Object.freeze({...byId}),results:Object.freeze(results),errors:Object.freeze(errors),cycles:graph.cycles,order:graph.order});
  }
  const resolver={
   getCell(ref){
    if(!Object.prototype.hasOwnProperty.call(byId,ref))throw new Error("الخلية المشار إليها غير متاحة: "+ref);
    return byId[ref];
   },
   getCellById(id){
    if(!Object.prototype.hasOwnProperty.call(byId,id))throw new Error("الخلية المشار إليها غير متاحة أو لا تملك صلاحية قراءتها");
    return byId[id];
   },
   getRange(start,end){
    if(typeof options?.getRange!=="function")throw new Error("قراءة نطاق الخلايا غير مهيأة");
    return options.getRange(start,end,byId);
   }
  };
  for(const id of graph.order){
   const failedDependency=(dependencies[id]||[]).find(dep=>Object.prototype.hasOwnProperty.call(errors,dep));
   if(failedDependency){errors[id]="تعذر الحساب بسبب خطأ في الخلية المرتبطة: "+failedDependency;continue;}
   try{
    const value=engine.evaluate(formulas[id],resolver);
    if(typeof value!=="number"||!Number.isFinite(value))throw new Error("يجب أن تكون نتيجة المعادلة رقمًا صالحًا");
    byId[id]=value;results[id]=value;
   }catch(error){errors[id]=error&&error.message?error.message:"تعذر حساب المعادلة";}
  }
  return Object.freeze({values:Object.freeze({...byId}),results:Object.freeze(results),errors:Object.freeze(errors),cycles:graph.cycles,order:graph.order});
 }
 const api=Object.freeze({recalculate});
 root.NOVAROFormulaRuntime=api;
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
