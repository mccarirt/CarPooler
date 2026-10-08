// Avatar colors. Each person (parent or child) has one, so a ride card can be read at a glance.
// A person can pick their own; until they do, one is chosen for them from their id, so the same
// person always gets the same color on every screen and every phone.
export type PaletteColor = { key: string; label: string; fg: string; bg: string };

export const PALETTE: PaletteColor[] = [
  { key: 'terracotta', label: 'Terracotta', fg: '#B8471F', bg: '#F8DDD0' },
  { key: 'teal', label: 'Teal', fg: '#0E7C7B', bg: '#D3EEEC' },
  { key: 'mustard', label: 'Mustard', fg: '#946000', bg: '#FBEBC2' },
  { key: 'green', label: 'Green', fg: '#3F7D3A', bg: '#DDEFD8' },
  { key: 'berry', label: 'Berry', fg: '#A3245C', bg: '#F8D9E6' },
  { key: 'blue', label: 'Blue', fg: '#2F5D9E', bg: '#DCE8F7' },
  { key: 'plum', label: 'Plum', fg: '#7A3E9D', bg: '#EBDDF4' },
  { key: 'clay', label: 'Clay', fg: '#7A4B2B', bg: '#EBDCCF' },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// The chosen color if there is one, otherwise a stable one picked from the person's id.
export function colorFor(id: string, chosenKey?: string | null): PaletteColor {
  return PALETTE.find((c) => c.key === chosenKey) ?? PALETTE[hash(id) % PALETTE.length];
}
