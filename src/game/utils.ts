/**
 * Random source used by all dice rolls. Defaults to Math.random; tests can
 * inject a deterministic source via setRandomSource().
 */
let randomSource: () => number = Math.random;

export function setRandomSource(source: () => number): void {
  randomSource = source;
}

export function resetRandomSource(): void {
  randomSource = Math.random;
}

export function rollDie(): number {
  return Math.floor(randomSource() * 6) + 1;
}

export function rollDice(count: number): number[] {
  return Array.from({ length: count }, () => rollDie());
}