const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'formula-ui.js'), 'utf8');

function bootUi() {
  const listeners = {};
  const timers = new Map();
  let nextTimer = 1;
  const body = {
    addEventListener(type, handler, capture) { listeners[type + ':' + !!capture] = handler; },
    appendChild() {}
  };
  const document = {
    readyState: 'complete',
    body,
    head: { appendChild() {} },
    getElementById() { return null; },
    createElement() { return { id: '', textContent: '', style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const window = {
    document,
    setTimeout(handler) { const id = nextTimer++; timers.set(id, handler); return id; },
    clearTimeout(id) { timers.delete(id); },
    getComputedStyle() { return { font: '12px Arial', fontSize: '12px', position: 'static' }; }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
  }
  vm.runInNewContext(source, {
    window,
    MutationObserver,
    console,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout
  }, { filename: 'formula-ui.js' });
  return { window, listeners, timers };
}

test('formula controls are inline and no ƒx buttons or adjacent formula wrappers are created', () => {
  assert.doesNotMatch(source, /novaro-fx-btn|novaro-fx-wrap|ƒx/);
  assert.match(source, /className="novaro-fx-display"/);
  assert.match(source, /function displayFormula\(input,text,isError\)/);
});

test('typing equals opens the formula editor and double-click edits a saved formula', () => {
  assert.match(source, /if\(event\.key==="="/);
  assert.match(source, /addEventListener\("dblclick",handleCellDoubleClick,true\)/);
  assert.match(source, /openExistingFormula\(input\)/);
});

test('formula editor suggests supported functions while typing', () => {
  for (const fn of ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'IF', 'ROUND']) {
    assert.match(source, new RegExp("\\['" + fn + "'"));
  }
  assert.match(source, /function updateSuggestions\(\)/);
  assert.match(source, /editor\.suggestions\.appendChild\(button\)/);
});

test('cross-page picker inserts a stable CELL reference from the clicked eligible input', () => {
  assert.match(source, /function beginCellPick\(\)/);
  assert.match(source, /function handlePickClick\(event\)/);
  assert.match(source, /const expression=quoteCellId\(id\)/);
  assert.match(source, /CELL\("\\'+String\(id\)/);
  assert.match(source, /editor\.pickerHint\.textContent/);
});

test('formula results are displayed over the cell without changing its original value', () => {
  assert.match(source, /input\.style\.color="transparent"/);
  assert.match(source, /input\.readOnly=true/);
  assert.match(source, /display\.textContent=text/);
  assert.doesNotMatch(source, /\binput\.value\s*=/);
  assert.match(source, /storage\(\)\.saveFormula\(id,formula,db,map\(\),adapter\(\),engine\(\)\)/);
});

test('formula UI keeps its public refresh and recalculation APIs', () => {
  const app = bootUi();
  assert.equal(typeof app.window.NOVAROFormulaUI.refresh, 'function');
  assert.equal(typeof app.window.NOVAROFormulaUI.recalculate, 'function');
  assert.equal(typeof app.window.NOVAROFormulaUI.openEditor, 'function');
});

test('formula editor does not introduce database schema or privileged access code', () => {
  assert.doesNotMatch(source, /service_role|serviceRole|SECURITY DEFINER|ALTER TABLE|CREATE POLICY|DROP POLICY/i);
  assert.match(source, /storage\(\)\.loadFormulas/);
  assert.match(source, /loader\(\)\.loadCells/);
});
