/* NOVARO Formula Dependency Graph
 * Pure dependency ordering and circular-reference detection.
 * The caller supplies dependencies after resolving sheet/range references.
 */
(function(root){
  "use strict";
  function build(formulas, getDependencies){
    if(!formulas || typeof formulas!=="object" || typeof getDependencies!=="function")
      throw new Error("بيانات المعادلات أو قارئ المراجع غير صالح");
    const keys=Object.keys(formulas), known=new Set(keys), deps=new Map();
    for(const id of keys){
      const raw=getDependencies(formulas[id],id);
      if(!Array.isArray(raw)) throw new Error("قائمة مراجع الخلية غير صالحة: "+id);
      const unique=[...new Set(raw.map(String))];
      for(const ref of unique) if(!known.has(ref)) {
        // References to ordinary numeric input cells are valid leaves.
      }
      deps.set(id,unique);
    }
    const state=new Map(),stack=[],order=[],cycles=[];
    function visit(id){
      const status=state.get(id)||0;
      if(status===2)return;
      if(status===1){
        const start=stack.indexOf(id);
        cycles.push(stack.slice(start).concat(id));
        return;
      }
      state.set(id,1);stack.push(id);
      for(const ref of deps.get(id)||[]) if(known.has(ref)) visit(ref);
      stack.pop();state.set(id,2);order.push(id);
    }
    for(const id of keys) visit(id);
    const uniqueCycles=[],seen=new Set();
    for(const cycle of cycles){
      const body=cycle.slice(0,-1), rotations=body.map((_,i)=>body.slice(i).concat(body.slice(0,i)).join("\u0000"));
      const key=rotations.sort()[0];
      if(!seen.has(key)){seen.add(key);uniqueCycles.push(cycle);}
    }
    return Object.freeze({
      order:Object.freeze(order.filter((id,i)=>order.indexOf(id)===i)),
      cycles:Object.freeze(uniqueCycles.map(c=>Object.freeze(c))),
      dependencies:Object.freeze(Object.fromEntries([...deps].map(([id,list])=>[id,Object.freeze(list.slice())]))),
      hasCycles:uniqueCycles.length>0
    });
  }
  const api=Object.freeze({build});
  root.NOVAROFormulaDependencyGraph=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
