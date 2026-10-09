export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

// The short name to show for someone: their first name. If someone else in the same group shares that first
// name (two Pats), add the last initial to tell them apart: "Pat S." and "Pat J.". `all` is every name in the
// group the person belongs to (the circle's parents, or its children).
export function displayName(name: string, all: string[]) {
  const first = firstName(name);
  const clash = all.filter((n) => firstName(n).toLowerCase() === first.toLowerCase()).length > 1;
  const parts = name.trim().split(/\s+/);
  return clash && parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
}
