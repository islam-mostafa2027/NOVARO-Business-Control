const test=require("node:test");
const assert=require("node:assert/strict");
const cells=require("./formula-cell-map.js");
const adapter=require("./formula-source-adapter.js");
const engine=require("./formula-engine.js");
const storage=require("./formula-storage.js");

function dbMock(rows=[]){
 const calls=[];
 return {
  calls,
  from(table){
   const call={table,action:"",payload:null,options:null,filters:[]};calls.push(call);
   const q={
    select(columns){call.action="select";call.columns=columns;return q;},
    in(column,values){call.filters.push([column,values]);return Promise.resolve({data:rows,error:null});},
    upsert(payload,options){call.action="upsert";call.payload=payload;call.options=options;return Promise.resolve({data:null,error:null});},
    delete(){call.action="delete";return q;},
    eq(column,value){call.filters.push([column,value]);return Promise.resolve({data:null,error:null});}
   };
   return q;
  }
 };
}

test("loads only RLS-visible formulas for validated stable cell IDs",async()=>{
 const id=cells.salesMetric("branch-1","Nov-2026","yesterday_tip");
 const db=dbMock([{cell_id:id,formula:"=12+CELL(\"NOVARO|sales|branch-1|Nov-2026|sales_target\")"}]);
 const formulas=await storage.loadFormulas([id],db,cells,adapter);
 assert.equal(formulas[id],db.calls.length===1?`=12+CELL("NOVARO|sales|branch-1|Nov-2026|sales_target")`:null);
 assert.equal(db.calls[0].columns,"cell_id,formula");
 assert.deepEqual(db.calls[0].filters,[["cell_id",[id]]]);
});

test("saves parsed formulas separately from source values",async()=>{
 const id=cells.itemMinimumStock("00000000-0000-0000-0000-000000000001");
 const db=dbMock();
 assert.equal(await storage.saveFormula(id,"=12+3",db,cells,adapter,engine),true);
 assert.equal(db.calls[0].table,"formula_cells");
 assert.equal(db.calls[0].action,"upsert");
 assert.deepEqual(db.calls[0].payload,{cell_id:id,formula:"=12+3"});
 assert.deepEqual(db.calls[0].options,{onConflict:"cell_id"});
});

test("rejects malformed IDs and invalid formulas before database writes",async()=>{
 const db=dbMock();
 await assert.rejects(()=>storage.saveFormula("NOVARO|unknown|x","=1",db,cells,adapter,engine));
 await assert.rejects(()=>storage.saveFormula(cells.itemMinimumStock("item-1"),"1+2",db,cells,adapter,engine));
 await assert.rejects(()=>storage.saveFormula(cells.itemMinimumStock("item-1"),"=2+@",db,cells,adapter,engine));
 assert.equal(db.calls.length,0);
});

test("removes a formula without touching its source business record",async()=>{
 const id=cells.branchRequiredHeadcount("00000000-0000-0000-0000-000000000001");
 const db=dbMock();
 assert.equal(await storage.removeFormula(id,db,cells,adapter),true);
 assert.equal(db.calls[0].table,"formula_cells");
 assert.equal(db.calls[0].action,"delete");
 assert.deepEqual(db.calls[0].filters,[["cell_id",id]]);
});
