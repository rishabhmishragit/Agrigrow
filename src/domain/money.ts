/** Ghanaian cedi amounts are rounded to the nearest pesewa. */
export function roundGhs(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Amount must be a finite number.");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatGhs(value: number): string {
  const rounded = roundGhs(value);
  const negative = rounded < 0;
  const [whole, frac] = Math.abs(rounded).toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}GHS ${withCommas}.${frac}`;
}
