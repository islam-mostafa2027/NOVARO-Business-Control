const test = require("node:test");
const assert = require("node:assert/strict");
const cells = require("./formula-cell-map.js");
const adapter = require("./formula-source-adapter.js");

test("inventory count maps to the existing count row without writing it",()=>{
 const d=adapter.describeCell(cells.inventoryCount("b","s","i"),cells);
 assert.equal(d.table,"inventory_counts");
 assert.deepEqual(d.filters,{session_id:"s",item_id:"i"});
 assert.equal(d.column,"counted_quantity");
 assert.equal(d.writeScope,"inventory_open_session");
 assert.equal(adapter.extractValue(d,{counted_quantity:"12.5"}),12.5);
});

test("item and branch cells map to their actual source columns",()=>{
 const item=adapter.describeCell(cells.itemMinimumStock("i"),cells);
 assert.deepEqual([item.table,item.column,item.filters.id],["items","min_stock","i"]);
 const branch=adapter.describeCell(cells.branchRequiredHeadcount("b"),cells);
 assert.deepEqual([branch.table,branch.column,branch.filters.id,branch.writeScope],["branches","required_headcount","b","owner_admin_only"]);
});

test("sales metrics resolve to their separate source tables",()=>{
 const target=adapter.describeCell(cells.salesMetric("b","Nov-2026","sales_target"),cells);
 const tip=adapter.describeCell(cells.salesMetric("b","Nov-2026","yesterday_tip"),cells);
 assert.deepEqual([target.table,target.column],["sales_report_targets","sales_target"]);
 assert.deepEqual([tip.table,tip.column],["sales_report_months","yesterday_tip"]);
});

test("statistics fields map to actual database column names",()=>{
 const tickets=adapter.describeCell(cells.statisticsMetric("b","Nov-2026",21,"dinein","tickets"),cells);
 const sales=adapter.describeCell(cells.statisticsMetric("b","Nov-2026",21,"catering","sales"),cells);
 const target=adapter.describeCell(cells.statisticsDailyTarget("b","Nov-2026",21),cells);
 assert.equal(tickets.column,"dinein_tickets");
 assert.equal(sales.column,"catering_sales");
 assert.equal(target.column,"daily_target");
 assert.equal(tickets.filters.report_day,21);
});

test("daily tip reads the exact day and field from the persisted rows array",()=>{
 const d=adapter.describeCell(cells.dailyTipCell("b","Nov-2026","sheet-1",21,"tip_amount"),cells);
 assert.deepEqual([d.table,d.column,d.filters.id],["sales_report_tip_sheets","rows","sheet-1"]);
 assert.equal(adapter.extractValue(d,{rows:[{day:20,tip_amount:9},{day:21,tip_amount:17.5}]}),17.5);
 assert.equal(adapter.extractValue(d,{rows:[{day:20,tip_amount:9}]}),null);
});

test("headcount count maps by persisted role id and branch",()=>{
 const d=adapter.describeCell(cells.headcountRequired("b","role-4"),cells);
 assert.deepEqual([d.table,d.column,d.filters.id,d.filters.branch_id],["branch_headcount_roles","required_count","role-4","b"]);
});

test("unsupported and malformed stable identifiers are rejected",()=>{
 for(const id of ["NOVARO|sales|b|Nov-2026|daily_sales_target","NOVARO|statistics|b|Nov-2026|40|dinein|sales","NOVARO|daily_tip|b|Nov-2026|sheet|21|percentage","NOVARO|unknown|b"]) {
  assert.throws(()=>adapter.describeCell(id,cells));
 }
});

test("invalid stored numeric values fail closed",()=>{
 const d=adapter.describeCell(cells.itemMinimumStock("i"),cells);
 assert.throws(()=>adapter.extractValue(d,{min_stock:"not-a-number"}));
});
