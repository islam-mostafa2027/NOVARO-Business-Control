const test = require("node:test");
const assert = require("node:assert/strict");
const cells = require("./formula-cell-map.js");
const adapter = require("./formula-source-adapter.js");
const loader = require("./formula-data-loader.js");

function mockDb(responses){
 const calls=[];
 return {
  calls,
  from(table){
   const call={table,columns:"",filters:[]};calls.push(call);
   const builder={
    select(columns){call.columns=columns;return builder;},
    eq(column,value){call.filters.push([column,value]);return builder;},
    async maybeSingle(){return {data:responses[table]??null,error:null};}
   };
   return builder;
  }
 };
}

test("loader groups fields from the same statistics row into one RLS-protected read",async()=>{
 const db=mockDb({sales_report_statistics_entries:{dinein_tickets:8,dinein_sales:240,report_day:3}});
 const ids=[
  cells.statisticsMetric("b","Nov-2026",3,"dinein","tickets"),
  cells.statisticsMetric("b","Nov-2026",3,"dinein","sales")
 ];
 const values=await loader.loadCells(ids,db,cells,adapter);
 assert.deepEqual(Object.values(values),[8,240]);
 assert.equal(db.calls.length,1);
 assert.equal(db.calls[0].table,"sales_report_statistics_entries");
 assert.equal(db.calls[0].columns,"dinein_sales,dinein_tickets");
 assert.deepEqual(db.calls[0].filters,[["branch_id","b"],["report_day",3],["report_month","Nov-2026"]]);
});

test("loader reads daily tip values from the existing JSON rows field",async()=>{
 const db=mockDb({sales_report_tip_sheets:{rows:[{day:7,tip_amount:55,dinein_sales:500}]}});
 const id=cells.dailyTipCell("b","Nov-2026","sheet-1",7,"tip_amount");
 const values=await loader.loadCells([id],db,cells,adapter);
 assert.equal(values[id],55);
 assert.equal(db.calls[0].columns,"rows");
 assert.deepEqual(db.calls[0].filters,[["branch_id","b"],["id","sheet-1"],["report_month","Nov-2026"]]);
});

test("loader treats a missing permitted source row as an empty cell",async()=>{
 const db=mockDb({});
 const id=cells.itemMinimumStock("item-1");
 const values=await loader.loadCells([id],db,cells,adapter);
 assert.equal(values[id],null);
});

test("loader fails closed when Supabase reports an RLS or query error",async()=>{
 const db={from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:null,error:new Error("permission denied")};}};return q;}};
 const id=cells.branchRequiredHeadcount("branch-1");
 await assert.rejects(()=>loader.loadCells([id],db,cells,adapter),/permission denied/);
});

test("loader rejects invalid or excessive input before querying",async()=>{
 const db=mockDb({});
 await assert.rejects(()=>loader.loadCells("not-an-array",db,cells,adapter));
 await assert.rejects(()=>loader.loadCells(["NOVARO|unknown|x"],db,cells,adapter));
 assert.equal(db.calls.length,0);
});

test("inventory loader constrains the embedded session to the branch encoded in the cell ID",async()=>{
 const db=mockDb({inventory_counts:{counted_quantity:14,inventory_sessions:{branch_id:"branch-a"}}});
 const id=cells.inventoryCount("branch-a","session-1","item-1");
 const values=await loader.loadCells([id],db,cells,adapter);
 assert.equal(values[id],14);
 assert.equal(db.calls[0].columns,"counted_quantity,inventory_sessions!inner(branch_id)");
 assert.deepEqual(db.calls[0].filters,[
  ["inventory_sessions.branch_id","branch-a"],
  ["item_id","item-1"],
  ["session_id","session-1"]
 ]);
});
