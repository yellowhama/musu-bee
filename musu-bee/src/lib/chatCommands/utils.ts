let idCounter = 100;
export function makeId() {
  return `ws-${++idCounter}-${Date.now()}`;
}
