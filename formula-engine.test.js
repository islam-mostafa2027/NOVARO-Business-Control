const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("./formula-engine.js");

const values = { A1: 10, B1: 5, A2: 3, B2: 2 };
const resolver = {
  getCell(ref) {
    if (!Object.prototype.hasOwnProperty.call(values, ref)) throw new Error("Unknown cell: " + ref);
    return values[ref];
  },
  getCellById(id) {
    const cells = { "NOVARO|sales|branch-1|Nov-2026|sales_target": 1200, "NOVARO|inventory|branch-1|session-1|item-1|counted_quantity": 35 };
    if (!Object.prototype.hasOwnProperty.call(cells, id)) throw new Error("Unknown stable cell: " + id);
    return cells[id];
  },
  getRange(start, end) {
    const cells = { "A1:B2": [[10, 5], [3, 2]] };
    const key = start + ":" + end;
    if (!cells[key]) throw new Error("Unknown range: " + key);
    return cells[key];
  }
};

test("arithmetic and precedence", () => {
  assert.equal(engine.evaluate("=2+3*4", resolver), 14);
  assert.equal(engine.evaluate("=(2+3)*4", resolver), 20);
  assert.equal(engine.evaluate("=2^3^2", resolver), 512);
});
test("cell references and ranges", () => {
  assert.equal(engine.evaluate("=A1+B1", resolver), 15);
  assert.equal(engine.evaluate("=SUM(A1:B2)", resolver), 20);
  assert.equal(engine.evaluate("=AVERAGE(A1:B2)", resolver), 5);
});
test("supported aggregate and scalar functions", () => {
  assert.equal(engine.evaluate("=MIN(A1,B1,A2)", resolver), 3);
  assert.equal(engine.evaluate("=MAX(A1,B1,A2)", resolver), 10);
  assert.equal(engine.evaluate("=COUNT(A1:B2)", resolver), 4);
  assert.equal(engine.evaluate("=ABS(-7)", resolver), 7);
  assert.equal(engine.evaluate("=ROUND(1.236,2)", resolver), 1.24);
  assert.equal(engine.evaluate("=AND(1,2)", resolver), true);
  assert.equal(engine.evaluate("=NOT(0)", resolver), true);
  assert.equal(engine.evaluate("=AND(TRUE,NOT(FALSE))", resolver), true);
});
test("IF evaluates only the selected branch", () => {
  assert.equal(engine.evaluate("=IF(1=1,25,1/0)", resolver), 25);
  assert.equal(engine.evaluate("=IF(1=2,25,9)", resolver), 9);
});
test("quoted strings and comparisons", () => {
  assert.equal(engine.evaluate('=IF("a"="a","yes","no")', resolver), "yes");
  assert.equal(engine.evaluate('=IF("a""b"="a""b",1,0)', resolver), 1);
});
test("invalid formulas fail safely", () => {
  assert.throws(() => engine.evaluate("2+3", resolver));
  assert.throws(() => engine.evaluate("=1/0", resolver), /صفر/);
  assert.throws(() => engine.evaluate("=UNKNOWN(1)", resolver));
  assert.throws(() => engine.evaluate("=A1+", resolver));
  assert.throws(() => engine.evaluate("=1+2;alert(1)", resolver));
  assert.throws(() => engine.evaluate("=" + "1+".repeat(2500) + "1", resolver));
});

test("stable cross-page CELL references", () => {
  assert.equal(engine.evaluate('=CELL("NOVARO|sales|branch-1|Nov-2026|sales_target")+CELL("NOVARO|inventory|branch-1|session-1|item-1|counted_quantity")', resolver), 1235);
  assert.throws(() => engine.evaluate('=CELL("missing")', resolver), /Unknown stable cell/);
  assert.throws(() => engine.evaluate("=CELL(A1)", resolver), /معرّف خلية نصيًا ثابتًا/);
});

test("extracts direct, range and stable CELL dependencies", () => {
  const refs = engine.getDependencies('=SUM(A1:B4)+CELL("sales|branch|Nov-2026|sales_target")');
  assert.deepEqual(refs, ["A1", "B4", "NOVARO|sales|branch|Nov-2026|sales_target"]);
});
test("dependency extraction rejects malformed formulas", () => {
  assert.throws(() => engine.getDependencies("A1+2"));
  assert.throws(() => engine.getDependencies('=CELL(A1)'));
});
