const assert = require('assert');
const { mergeAvistamientoCreated, removeById } = require('./realtimeMerge');

// mergeAvistamientoCreated: prepends a new item
{
  const prev = [{ id: 2, species: 'B' }];
  const result = mergeAvistamientoCreated(prev, { id: 1, species: 'A' });
  assert.deepStrictEqual(result, [{ id: 1, species: 'A' }, { id: 2, species: 'B' }]);
}

// mergeAvistamientoCreated: dedupes by id, does not double-insert
{
  const prev = [{ id: 1, species: 'A' }];
  const result = mergeAvistamientoCreated(prev, { id: 1, species: 'A (duplicate)' });
  assert.strictEqual(result, prev); // same reference: no-op, not a mutated copy
  assert.strictEqual(result.length, 1);
}

// removeById: removes the matching item, leaves others untouched
{
  const prev = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const result = removeById(prev, 2);
  assert.deepStrictEqual(result, [{ id: 1 }, { id: 3 }]);
}

// removeById: no-op if id not present
{
  const prev = [{ id: 1 }];
  const result = removeById(prev, 999);
  assert.deepStrictEqual(result, [{ id: 1 }]);
}

console.log('realtimeMerge.test.js: all assertions passed');
