// Avatar colors. Each person (parent or child) has one, so a ride card can be read at a glance.
// A person can pick their own; until they do, one is chosen for them from their id, so the same
// person always gets the same color on every screen and every phone.
//
// Avatars are solid `fg` circles with white initials. Every color here keeps 4.5:1 contrast against
// white, and the eight are spread around the color wheel (plus one slate) so neighbors don't blur.
// The `key`s are saved on people's records, so never rename one; changing a color's look is fine.
export type PaletteColor = { key: string; label: string; fg: string; bg: string };

export const PALETTE: PaletteColor[] = [
  { key: 'terracotta', label: 'Orange', fg: '#C2410C', bg: '#FCE3D3' },
  { key: 'teal', label: 'Teal', fg: '#0F766E', bg: '#D3EEEC' },
  { key: 'mustard', label: 'Gold', fg: '#A16207', bg: '#FBEBC2' },
  { key: 'green', label: 'Green', fg: '#3F7D3A', bg: '#DDEFD8' },
  { key: 'berry', label: 'Pink', fg: '#BE185D', bg: '#FBD9E8' },
  { key: 'blue', label: 'Blue', fg: '#2563EB', bg: '#DCE8FB' },
  { key: 'plum', label: 'Purple', fg: '#7E22CE', bg: '#EDDDF8' },
  { key: 'clay', label: 'Slate', fg: '#475569', bg: '#E2E8F0' },
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
