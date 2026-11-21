const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./formula-engine');
const map = require('./formula-cell-map');
const adapter = require('./formula-source-adapter');
const graph = require('./formula-dependency-graph');
const runtime = require('./formula-runtime');

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
