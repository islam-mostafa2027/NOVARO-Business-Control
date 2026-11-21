/* NOVARO stable formula-cell identifiers.
 * These IDs describe persisted business records, never DOM order or row position.
 * Only fields confirmed as editable numeric inputs are listed.
 */
(function (root) {
  "use strict";

  const SALES_METRICS = Object.freeze([
    "sales_target",
    "daily_sales_target",
    "month_to_date_sales",
    "yesterday_sales",
    "yesterday_tip",
    "month_to_date_tip"
  ]);
  const STAT_GROUPS = Object.freeze(["dinein", "takeaway", "delivery", "catering"]);
  const STAT_FIELDS = Object.freeze(["tickets", "sales"]);
  const PART = value => {
    const text = String(value ?? "").trim();
    if (!text || text.length > 160) throw new Error("Invalid formula cell identifier part");
    return encodeURIComponent(text);
  };
  const make = (...parts) => "NOVARO|" + parts.map(PART).join("|");

  const api = Object.freeze({
    salesMetrics: SALES_METRICS,
    statisticsGroups: STAT_GROUPS,
    statisticsFields: STAT_FIELDS,
    inventoryCount: (branchId, sessionId, itemId) => make("inventory", branchId, sessionId, itemId, "counted_quantity"),
    salesMetric: (branchId, reportMonth, metric) => {
      if (!SALES_METRICS.includes(metric)) throw new Error("Unsupported sales metric");
      return make("sales", branchId, reportMonth, metric);
    },
    statisticsMetric: (branchId, reportMonth, day, group, field) => {
      const dayNumber = Number(day);
      if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) throw new Error("Invalid report day");
      if (!STAT_GROUPS.includes(group) || !STAT_FIELDS.includes(field)) throw new Error("Unsupported statistics metric");
      return make("statistics", branchId, reportMonth, dayNumber, group, field);
    },
    statisticsDailyTarget: (branchId, reportMonth, day) => {\n      const dayNumber = Number(day);\n      if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) throw new Error("Invalid report day");\n      return make("statistics", branchId, reportMonth, dayNumber, "daily_target");\n    },\n    dailyTipCell: (branchId, reportMonth, sheetId, day, field) => {\n      const dayNumber = Number(day);\n      if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) throw new Error("Invalid tip day");\n      if (!["tip_amount", "dinein_sales"].includes(field)) throw new Error("Unsupported daily tip field");\n      return make("daily_tip", branchId, reportMonth, sheetId, dayNumber, field);\n    },\n    headcountRequired: (branchId, roleId) => make("headcount", branchId, roleId, "required_count"),
    decode: id => {
      if (typeof id !== "string" || !id.startsWith("NOVARO|")) throw new Error("Invalid formula cell identifier");
      const parts = id.slice(7).split("|").map(decodeURIComponent);
      if (parts.some(part => !part)) throw new Error("Invalid formula cell identifier");
      return Object.freeze(parts);
    }
  });

  root.NOVAROFormulaCellMap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
