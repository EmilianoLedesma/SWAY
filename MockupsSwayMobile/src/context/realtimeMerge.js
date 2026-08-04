function mergeAvistamientoCreated(prev, mapped) {
  if (prev.some((s) => s.id === mapped.id)) return prev;
  return [mapped, ...prev];
}

function removeById(prev, id) {
  return prev.filter((s) => s.id !== id);
}

module.exports = { mergeAvistamientoCreated, removeById };
