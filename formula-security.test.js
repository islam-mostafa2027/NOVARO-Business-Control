const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, 'supabase/migrations/20261122031609_harden_formula_cell_column_grants.sql'),
  'utf8'
);

test('formula storage removes broad insert and update grants', () => {
  assert.match(migration, /revoke insert, update on table public\.formula_cells from authenticated/i);
  assert.match(migration, /grant insert \(cell_id, formula\)[\s\S]*?to authenticated/i);
  assert.match(migration, /grant update \(formula\)[\s\S]*?to authenticated/i);
  assert.doesNotMatch(migration, /grant all on table public\.formula_cells/i);
});

// Regression guard for the applied production grants migration.
