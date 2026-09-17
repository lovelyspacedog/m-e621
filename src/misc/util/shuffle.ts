/** Fisher–Yates shuffle; mutates and returns `items`. */
export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i]!;
    items[i] = items[j]!;
    items[j] = current;
  }
  return items;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffled<T>(items: readonly T[]): T[] {
  return shuffleInPlace([...items]);
}
