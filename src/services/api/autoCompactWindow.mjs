/** Parse the 2.1.310 --autocompact auto|tokens syntax. */
export function parseAutoCompactWindowOption(raw) {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  if (value === 'auto') return 'auto';
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(value);
  if (!match) return undefined;
  const number = Number(match[1]);
  let tokens = number * (match[2] === 'k' ? 1000 : match[2] === 'm' ? 1000000 : 1);
  if (!match[2] && number >= 100 && number <= 1000) tokens *= 1000;
  if (!Number.isFinite(tokens) || tokens < 100000 || tokens > 1000000) return undefined;
  return Math.round(tokens);
}
