const test=require("node:test");
const assert=require("node:assert/strict");
const runtime=require("./formula-runtime.js");
const engine=require("./formula-engine.js");
const graph=require("./formula-dependency-graph.js");
const options={engine,graph};
test("recalculates dependent cells in dependency order",()=>{
 const r=runtime.recalculate({A:"=B+2",B:"=C*3",C:"=4"},{C:4},{...options});
 assert.deepEqual(r.results,{C:4,B:12,A:14});
 assert.deepEqual(r.errors,{});
});
test("resolves stable cross-page CELL references from authorized prefetched values",()=>{
 const id="NOVARO|sales|b|Nov-2026|sales_target";
 const r=runtime.recalculate({A:'=CELL("'+id+'")*2'},{[id]:125},{...options});
 assert.equal(r.results.A,250);
});
test("reports circular references without evaluating them",()=>{
 const r=runtime.recalculate({A:"=B+1",B:"=A+1"},{},{...options});
 assert.equal(r.cycles.length,1);
 assert.ok(r.errors.A&&r.errors.B);
});
test("reports inaccessible references without returning fabricated values",()=>{
 const r=runtime.recalculate({A:"=CELL(\"NOVARO|sales|other-branch|Nov-2026|sales_target\")"},{},{...options});
 assert.match(r.errors.A,/غير متاحة/);
});
test("preserves independent formulas when another formula has a bad reference",()=>{
 const r=runtime.recalculate({A:"=MISSING+1",B:"=2+3"},{},{...options});
 assert.equal(r.results.B,5);
 assert.ok(r.errors.A);
});
