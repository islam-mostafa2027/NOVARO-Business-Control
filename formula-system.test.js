const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./formula-engine');
const map = require('./formula-cell-map');
const adapter = require('./formula-source-adapter');
const graph = require('./formula-dependency-graph');
const runtime = require('./formula-runtime');
const storage = require('./formula-storage');

const branch = '11111111-1111-4111-8111-111111111111';
const sheet = '22222222-2222-4222-8222-222222222222';

test('stable cell identifiers map only to supported source columns', () => {
  const sales = map.salesMetric(branch, 'Nov-2026', 'sales_target');
  const stats = map.statisticsMetric(branch, 'Nov-2026', 1, 'dinein', 'sales');
  const tip = map.dailyTipCell(branch, 'Nov-2026', sheet, 1, 'tip_amount');
  assert.equal(adapter.describeCell(sales, map).column, 'sales_target');
  assert.equal(adapter.describeCell(stats, map).column, 'dinein_sales');
  assert.equal(adapter.describeCell(tip, map).table, 'sales_report_tip_sheets');
  assert.throws(() => adapter.describeCell('NOVARO|unknown|x', map));
});

test('formula engine evaluates arithmetic, functions and stable cell references', () => {
  const target = map.salesMetric(branch, 'Nov-2026', 'sales_target');
  const daily = map.statisticsMetric(branch, 'Nov-2026', 1, 'dinein', 'sales');
  const formulas = {
    [target]: `=ROUND(CELL("${daily}")*1.1,2)`,
    [daily]: '=SUM(10,20)'
  };
  const result = runtime.recalculate(formulas, {[target]: 0, [daily]: 0}, {engine, graph});
  assert.equal(result.values[daily], 30);
  assert.equal(result.values[target], 33);
  assert.deepEqual(result.errors, {});
});

test('formula errors propagate to dependent cells instead of using stale source values', () => {
  const broken = map.salesMetric(branch, 'Nov-2026', 'sales_target');
  const dependent = map.statisticsMetric(branch, 'Nov-2026', 1, 'dinein', 'sales');
  const result = runtime.recalculate({
    [broken]: '=1/0',
    [dependent]: `=CELL("${broken}")+5`
  }, {[broken]: 100, [dependent]: 200}, {engine, graph});
  assert.ok(result.errors[broken].includes('القسمة على صفر'));
  assert.ok(result.errors[dependent].includes('بسبب خطأ'));
  assert.equal(Object.hasOwn(result.results, dependent), false);
});

test('dependency graph rejects circular formula references', () => {
  const a = map.salesMetric(branch, 'Nov-2026', 'sales_target');
  const b = map.statisticsMetric(branch, 'Nov-2026', 1, 'dinein', 'sales');
  const result = runtime.recalculate({
    [a]: `=CELL("${b}")+1`,
    [b]: `=CELL("${a}")+1`
  }, {[a]: 0, [b]: 0}, {engine, graph});
  assert.equal(result.cycles.length, 1);
  assert.ok(result.errors[a].includes('مرجع دائري'));
  assert.ok(result.errors[b].includes('مرجع دائري'));
});

test('invalid formulas fail safely without executing arbitrary code', () => {
  assert.throws(() => engine.evaluate('=1/0', {getCell(){return 0;}}), /القسمة على صفر/);
  assert.throws(() => engine.evaluate('=UNKNOWN(1)', {getCell(){return 0;}}), /غير مدعومة/);
  assert.throws(() => engine.getDependencies('=1+2'), /تبدأ بعلامة/);
});

test('formula storage validates, saves, loads and removes without touching source tables', async () => {
  const rows = new Map();
  const db = {
    from(table) {
      assert.equal(table, 'formula_cells');
      return {
        select() {
          return { in: async (column, ids) => ({
            data: ids.filter(id => rows.has(id)).map(id => ({ cell_id: id, formula: rows.get(id) })),
            error: null
          }) };
        },
        upsert: async row => { rows.set(row.cell_id, row.formula); return { error: null }; },
        delete() {
          return { eq: async (column, id) => { rows.delete(id); return { error: null }; } };
        }
      };
    }
  };
  const cell = map.salesMetric(branch, 'Nov-2026', 'sales_target');
  await storage.saveFormula(cell, '=SUM(2,3)', db, map, adapter, engine);
  assert.equal((await storage.loadFormulas([cell], db, map, adapter))[cell], '=SUM(2,3)');
  await assert.rejects(storage.saveFormula(cell, '=UNKNOWN(1)', db, map, adapter, engine));
  await assert.rejects(storage.saveFormula(cell, '=1/0', db, map, adapter, engine));
  await storage.removeFormula(cell, db, map, adapter);
  assert.equal(rows.size, 0);
});

test('inventory, item, branch and staffing cells resolve to their intended records', () => {
  const session = '33333333-3333-4333-8333-333333333333';
  const item = '44444444-4444-4444-8444-444444444444';
  const role = '55555555-5555-4555-8555-555555555555';
  assert.equal(adapter.describeCell(map.inventoryCount(branch, session, item), map).table, 'inventory_counts');
  assert.equal(adapter.describeCell(map.itemMinimumStock(item), map).column, 'min_stock');
  assert.equal(adapter.describeCell(map.branchRequiredHeadcount(branch), map).column, 'required_headcount');
  assert.equal(adapter.describeCell(map.headcountRequired(branch, role), map).column, 'required_count');
});
