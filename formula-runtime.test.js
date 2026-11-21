const test=require("node:test");
const assert=require("node:assert/strict");
const runtime=require("./formula-runtime.js");
const engine=require("./formula-engine.js");
const graph=require("./formula-dependency-graph.js");
const options={engine,graph};
test("recalculates dependent cells in dependency order",()=>{
 const r=runtime.recalculate({A1:"=B1+2",B1:"=C1*3",C1:"=4"},{C1:4},{...options});
 assert.deepEqual(r.results,{C1:4,B1:12,A1:14});
 assert.deepEqual(r.errors,{});
});
test("resolves stable cross-page CELL references from authorized prefetched values",()=>{
 const id="NOVARO|sales|b|Nov-2026|sales_target";
 const r=runtime.recalculate({A:'=CELL("'+id+'")*2'},{[id]:125},{...options});
 assert.equal(r.results.A,250);
});
test("reports circular references without evaluating them",()=>{
 const r=runtime.recalculate({A1:"=B1+1",B1:"=A1+1"},{},{...options});
 assert.equal(r.cycles.length,1);
 assert.ok(r.errors.A1&&r.errors.B1);
});
test("reports inaccessible references without returning fabricated values",()=>{
 const r=runtime.recalculate({A1:"=CELL(\"NOVARO|sales|other-branch|Nov-2026|sales_target\")"},{},{...options});
 assert.match(r.errors.A1,/غير متاحة/);
});
test("preserves independent formulas when another formula has a bad reference",()=>{
 const r=runtime.recalculate({A1:"=MISSING1+1",B1:"=2+3"},{},{...options});
 assert.equal(r.results.B1,5);
 assert.ok(r.errors.A1);
});
