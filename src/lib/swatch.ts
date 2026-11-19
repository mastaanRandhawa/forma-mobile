/** Pull the colour stops out of a CSS gradient/colour string for LinearGradient. */
export function swatchColors(sw?: string): [string, string, ...string[]] {
  const hex = sw?.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) ?? [];
  if (hex.length >= 2) return hex as [string, string, ...string[]];
  const one = hex[0] ?? "rgba(255,255,255,0.08)";
  return [one, one];
}
