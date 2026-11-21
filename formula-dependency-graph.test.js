const test=require("node:test");
const assert=require("node:assert/strict");
const {build}=require("./formula-dependency-graph.js");
test("orders formula cells after their formula dependencies",()=>{
 const g=build({A:"=B+1",B:"=C+1",C:"=2"},(f)=>({A:["B"],B:["C"],C:[]}[f[1]]));
 assert.deepEqual(g.order,["C","B","A"]);
 assert.equal(g.hasCycles,false);
});
test("detects direct and indirect circular references",()=>{
 const g=build({A:"=B",B:"=C",C:"=A"},(f)=>({A:["B"],B:["C"],C:["A"]}[f[1]]));
 assert.equal(g.hasCycles,true);
 assert.deepEqual(g.cycles[0],["A","B","C","A"]);
});
test("allows references to non-formula input cells as graph leaves",()=>{
 const g=build({A:"=INPUT+1"},()=>["INPUT"]);
 assert.equal(g.hasCycles,false);
 assert.deepEqual(g.order,["A"]);
});
test("rejects malformed dependency providers",()=>{
 assert.throws(()=>build({A:"=1"},()=>null),/غير صالحة/);
});
