const test = require("node:test");
const assert = require("node:assert/strict");
const cells = require("./formula-cell-map.js");

test("inventory identifiers use persisted branch, session and item IDs", () => {
  const id = cells.inventoryCount("branch-1", "session-2", "item-3");
  assert.deepEqual(cells.decode(id), ["inventory", "branch-1", "session-2", "item-3", "counted_quantity"]);
});
test("sales identifiers are stable across display order", () => {
  assert.equal(cells.salesMetric("b", "Nov-2026", "sales_target"), cells.salesMetric("b", "Nov-2026", "sales_target"));
  assert.deepEqual(cells.decode(cells.salesMetric("b", "Nov-2026", "month_to_date_tip")), ["sales", "b", "Nov-2026", "month_to_date_tip"]);
  assert.throws(() => cells.salesMetric("b", "Nov-2026", "calculated_total"));
});
test("statistics identifiers validate day, group and editable field", () => {
  assert.deepEqual(cells.decode(cells.statisticsMetric("b", "Nov-2026", 21, "dinein", "tickets")), ["statistics", "b", "Nov-2026", "21", "dinein", "tickets"]);
  assert.throws(() => cells.statisticsMetric("b", "Nov-2026", 32, "dinein", "sales"));
  assert.throws(() => cells.statisticsMetric("b", "Nov-2026", 2, "dinein", "average"));
});
test("headcount identifiers use role record ID, not row position or title", () => {
  assert.deepEqual(cells.decode(cells.headcountRequired("b", "role-9")), ["headcount", "b", "role-9", "required_count"]);
});
test("identifiers encode separators safely", () => {
  const id = cells.headcountRequired("branch|one", "role/2");
  assert.deepEqual(cells.decode(id), ["headcount", "branch|one", "role/2", "required_count"]);
});

test("statistics daily target has a stable day-level identifier", () => {
  assert.deepEqual(cells.decode(cells.statisticsDailyTarget("b", "Nov-2026", 21)), ["statistics", "b", "Nov-2026", "21", "daily_target"]);
  assert.throws(() => cells.statisticsDailyTarget("b", "Nov-2026", 0));
});
test("daily tip cells use persisted sheet identity and editable fields only", () => {
  assert.deepEqual(cells.decode(cells.dailyTipCell("b", "Nov-2026", "sheet-uuid", 21, "tip_amount")), ["daily_tip", "b", "Nov-2026", "sheet-uuid", "21", "tip_amount"]);
  assert.throws(() => cells.dailyTipCell("b", "Nov-2026", "sheet-uuid", 21, "percentage"));
});
