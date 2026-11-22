const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootFormulaUi(readyState = 'loading') {
  const listeners = {};
  const timers = new Map();
  let nextTimer = 1;
  let ready;
  const body = {
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelectorAll() { return []; }
  };
  const document = {
    readyState,
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
  if (ready) ready();
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
  assert.doesNotMatch(source, /\\binput\\.value\\s*=/, 'formula UI must never overwrite the original input value');
});

function bootFormulaUiWithVisibleCell() {
  const listeners = {};
  const timers = new Map();
  let nextTimer = 1;
  let ready;
  const monthCard = { dataset: { salesBranchId: 'branch-1' } };
  const page = { querySelector: selector => selector === '.sales-month-card' ? monthCard : null };
  const input = {
    id: '',
    value: '999',
    dataset: { salesMetric: 'sales_target' },
    classList: { contains: () => false },
    matches: selector => selector === 'input',
    closest: selector => selector === '.sales-report-page' ? page : null,
    hasAttribute: () => false,
    getAttribute: () => null
  };
  const result = {
    hidden: true,
    textContent: '',
    title: '',
    classList: { toggle() {}, remove() {} }
  };
  const button = { textContent: 'ƒx' };
  const wrap = {
    previousElementSibling: input,
    querySelector(selector) {
      return selector === '.novaro-fx-result' ? result : button;
    }
  };
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
    querySelectorAll(selector) { return selector === '.novaro-fx-wrap' ? [wrap] : []; },
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') ready = handler; }
  };
  const window = {
    document,
    NOVAROFormulaCellMap: {
      salesMetric: (...parts) => 'target:' + parts.join(':')
    },
    NOVAROFormulaSourceAdapter: {},
    NOVAROFormulaEngine: {
      getDependencies: formula => formula.includes('source-cell') ? ['source-cell'] : []
    },
    NOVAROFormulaDependencyGraph: {},
    NOVAROFormulaStorage: {
      async loadFormulas(ids) {
        return ids.includes('target:branch-1:Nov-2026:sales_target')
          ? { 'target:branch-1:Nov-2026:sales_target': '=CELL("source-cell")+1' }
          : {};
      }
    },
    NOVAROFormulaDataLoader: {
      async loadCells(ids) {
        return Object.fromEntries(ids.map(id => [id, id === 'source-cell' ? 10 : 5]));
      }
    },
    NOVAROFormulaRuntime: {
      recalculate(formulas, values) {
        assert.equal(values['target:branch-1:Nov-2026:sales_target'], 5,
          'the stale visible input must not replace the loaded source value for a formula cell');
        assert.equal(values['source-cell'], 10);
        return {
          values: { ...values, 'target:branch-1:Nov-2026:sales_target': 11 },
          results: { 'target:branch-1:Nov-2026:sales_target': 11 },
          errors: {}
        };
      }
    },
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
    db: {},
    salesReportSelectedMonth: 'Nov-2026'
  };
  const source = fs.readFileSync(path.join(__dirname, 'formula-ui.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'formula-ui.js' });
  ready();
  return { window, input, result, button, timers };
}

test('formula UI recalculates without overwriting the original input value', async () => {
  const app = bootFormulaUiWithVisibleCell();
  await app.window.NOVAROFormulaUI.recalculate();

  assert.equal(app.result.textContent, '= 11');
  assert.equal(app.result.hidden, false);
  assert.equal(app.input.value, '999', 'the original business input remains unchanged');
  assert.equal(app.button.textContent, 'ƒx ✓');
});

test('formula UI keeps its public API when loaded after DOMContentLoaded', () => {
  const app = bootFormulaUi('complete');
  assert.equal(typeof app.window.NOVAROFormulaUI.recalculate, 'function');
  assert.equal(typeof app.window.NOVAROFormulaUI.refresh, 'function');
});
