const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('all five inline application scripts remain syntactically valid', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]) && match[2].trim());
  assert.equal(scripts.length, 5, 'expected the five existing inline scripts');
  scripts.forEach((match, index) => {
    assert.doesNotThrow(
      () => new vm.Script(match[2], { filename: 'index-inline-' + (index + 1) + '.js' })
    );
  });
});

test('saved sales snapshots remove formula controls before storing HTML', () => {
  assert.match(
    html,
    /const clone=snapshotRoot\.cloneNode\(true\);[\s\S]*?clone\.querySelectorAll\("\.novaro-fx-wrap"\)\.forEach\(node=>node\.remove\(\)\);/
  );
  assert.match(html, /snapshot_html:clone\.outerHTML/);
});

test('saved snapshot metadata excludes formula buttons and result text', () => {
  assert.match(
    html,
    /const cleanCell=cell\.cloneNode\(true\);[\s\S]*?cleanCell\.querySelectorAll\("\.novaro-fx-wrap"\)\.forEach\(node=>node\.remove\(\)\);[\s\S]*?text:cleanCell\.innerText\.trim\(\)/
  );
});

test('sales report print copy removes formula controls before printing', () => {
  assert.match(
    html,
    /const copy=report\.cloneNode\(true\);[\s\S]*?copy\.querySelectorAll\("\.novaro-fx-wrap"\)\.forEach\(node=>node\.remove\(\)\);/
  );
});

test('Excel export reads the original input value rather than formula overlay text', () => {
  assert.match(
    html,
    /const field=cell\.querySelector\("input,textarea,select"\),raw=\(field\?field\.value:cell\.innerText\)/
  );
});

test('sales report print output uses the original input values', () => {
  assert.match(
    html,
    /copy\\.querySelectorAll\\("input,textarea,select"\\)\\.forEach\\(field=>\\{const span=document\\.createElement\\("span"\\);span\\.className="print-sales-value";span\\.textContent=field\\.value\\|\\|"—";/
  );
});
