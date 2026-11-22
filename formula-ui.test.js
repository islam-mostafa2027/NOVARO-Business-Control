const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootFormulaUi() {
  const listeners = {};
  const timers = new Map();
  let nextTimer = 1;
  let ready;
  const body = {
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelectorAll() { return []; }
  };
  const document = {
    readyState: 'loading',
    body,
    head: { appendChild() {} },
    getElementById() { return null; },
    createElement() { return { id: '', textContent: '' }; },
    querySelectorAll() { return []; },
    querySelector() { return { dataset: { salesBranchId: 'branch-1' } }; },
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') ready = handler; }
  };
  const window = {
    document,
    NOVAROFormulaCellMap: {
      salesMetric: (...parts) => 'sales:' + parts.join(':'),
      dailyTipCell: (...parts) => 'tip:' + parts.join(':')
    },
    NOVAROFormulaSourceAdapter: {},
    setTimeout(handler) {
      const id = nextTimer++;
      timers.set(id, handler);
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
  }
  const context = {
    window,
    MutationObserver,
    salesReportSelectedMonth: 'Nov-2026',
    dailyTipActiveSheetKey: 'first-half',
    dailyTipSheetCache: [{ sheet_key: 'first-half', id: 'sheet-1' }]
  };
  const source = fs.readFileSync(path.join(__dirname, 'formula-ui.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'formula-ui.js' });
  ready();
  return { listeners, timers, window, context };
}

function salesInput() {
  const monthCard = { dataset: { salesBranchId: 'branch-1' } };
  const page = { querySelector: selector => selector === '.sales-month-card' ? monthCard : null };
  return {
    id: '',
    dataset: { salesMetric: 'sales_target' },
    classList: { contains: () => false },
    matches: selector => selector === 'input',
    closest: selector => selector === '.sales-report-page' ? page : null,
    hasAttribute: () => false,
    getAttribute: () => null
  };
}

test('formula UI schedules recalculation after delegated input and change events', () => {
  const app = bootFormulaUi();
  const input = salesInput();

  app.listeners.input({ target: input });
  assert.equal(app.timers.size, 1, 'input event should schedule a refresh');

  app.listeners.change({ target: input });
  assert.equal(app.timers.size, 1, 'change event should debounce into the same refresh');

  const [timerId, run] = app.timers.entries().next().value;
  app.timers.delete(timerId);
  run();
});

test('daily tip cell identifiers retain the selected report month outside the sales-page branch', () => {
  const app = bootFormulaUi();
  const row = { dataset: { dailyTipDay: '4' } };
  const card = {};
  const input = {
    id: '',
    dataset: {},
    classList: { contains: () => false },
    matches: selector => selector === 'input',
    closest(selector) {
      if (selector === '#dailyTipRows tr[data-daily-tip-day]') return row;
      if (selector === '#dailyTipCard') return card;
      return null;
    },
    hasAttribute: name => name === 'data-tip-amount',
    getAttribute: () => null
  };

  app.listeners.input({ target: input });
  assert.equal(app.timers.size, 1, 'daily tip edits should schedule a refresh');
});

test('formula UI protects formula-backed cells and queues refreshes requested while busy', () => {
  const source = fs.readFileSync(path.join(__dirname, 'formula-ui.js'), 'utf8');
  assert.match(source, /function applyVisibleValues\(values,formulas=\{\}\)/);
  assert.match(source, /hasOwnProperty\.call\(formulas,id\)/);
  assert.match(source, /if\(restoreBusy\)\{restoreQueued=true;return;\}/);
  assert.match(source, /addEventListener\("input",handleCellValueChange,true\)/);
  assert.match(source, /addEventListener\("change",handleCellValueChange,true\)/);
});
