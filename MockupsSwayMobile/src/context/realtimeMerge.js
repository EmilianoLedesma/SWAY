function mergeAvistamientoCreated(prev, mapped) {
  if (prev.some((s) => s.id === mapped.id)) return prev;
  return [mapped, ...prev];
}

function removeById(prev, id) {
  return prev.filter((s) => s.id !== id);
}

function patchById(prev, id, patch) {
  if (!prev.some((s) => s.id === id)) return prev;
  return prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

module.exports = { mergeAvistamientoCreated, removeById, patchById };
