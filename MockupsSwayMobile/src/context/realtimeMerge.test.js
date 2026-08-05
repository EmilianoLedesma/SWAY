const assert = require('assert');
const { mergeAvistamientoCreated, removeById, patchById } = require('./realtimeMerge');

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

// removeById: works with string ids (matches SightingsScreen's String(a.id) normalization)
{
  const prev = [{ id: '1' }, { id: '2' }];
  const result = removeById(prev, '1');
  assert.deepStrictEqual(result, [{ id: '2' }]);
}

// patchById: merges patch into the matching item, leaves others untouched
{
  const prev = [{ id: '1', hasPhoto: false, photoUrl: null }, { id: '2', hasPhoto: false, photoUrl: null }];
  const result = patchById(prev, '1', { hasPhoto: true, photoUrl: 'http://x/photo.jpg' });
  assert.deepStrictEqual(result, [
    { id: '1', hasPhoto: true, photoUrl: 'http://x/photo.jpg' },
    { id: '2', hasPhoto: false, photoUrl: null },
  ]);
}

// patchById: no-op (same reference) if id not present
{
  const prev = [{ id: '1', hasPhoto: false }];
  const result = patchById(prev, '999', { hasPhoto: true });
  assert.strictEqual(result, prev);
}

console.log('realtimeMerge.test.js: all assertions passed');
