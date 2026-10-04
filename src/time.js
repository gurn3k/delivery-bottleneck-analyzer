export const HOUR = 3_600_000;
export const hoursBetween = (from, to) => (from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / HOUR) : null);
export const laterOf = (a, b) => (a && b ? (a > b ? a : b) : null);
