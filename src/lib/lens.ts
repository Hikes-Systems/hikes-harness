/**
 * Geometry for the glass rim. The rim lens is a second copy of the wallpaper,
 * clipped to a soft ring around the panel edge, so it must share the shell's
 * exact rectangle and corner radius.
 */
export interface LensGeometry {
  /** Layer size in CSS pixels. */
  width: number;
  height: number;
  /** Glass panel rectangle inside the layer, in CSS pixels. */
  panel: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  /** Width of the lens band, in CSS pixels. */
  band?: number;
}

const cache = new Map<string, string>();

const roundedRect = (x: number, y: number, width: number, height: number, radius: number): string => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return [
    `M${x + r} ${y}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V${y + height - r}`,
    `A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
};

/**
 * Soft ring mask for the rim copy. The centre is punched out so the live
 * wallpaper can show through the clear glass; the ring fades inward so the
 * magnified rim blends into the untouched backdrop.
 */
export function lensMask({ width, height, panel, band = 46 }: LensGeometry): string {
  if (typeof document === "undefined" || width < 2 || height < 2) return "";
  const key = `mask:${Math.round(width)}x${Math.round(height)}:${Math.round(panel.x)},${Math.round(panel.y)},${Math.round(panel.width)},${Math.round(panel.height)},${Math.round(panel.radius)},${band}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const inset = Math.min(band, panel.width / 2, panel.height / 2);
  const inner = {
    x: panel.x + inset,
    y: panel.y + inset,
    width: Math.max(1, panel.width - inset * 2),
    height: Math.max(1, panel.height - inset * 2),
    radius: Math.max(0, panel.radius - inset),
  };
  const outerPath = roundedRect(panel.x, panel.y, panel.width, panel.height, panel.radius);
  const innerPath = roundedRect(inner.x, inner.y, inner.width, inner.height, inner.radius);
  const fade = Math.max(2, Math.min(9, inset * 0.22));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}">`,
    `<defs><filter id="f" x="-12%" y="-12%" width="124%" height="124%"><feGaussianBlur stdDeviation="${fade.toFixed(1)}"/></filter></defs>`,
    `<path fill="white" fill-rule="evenodd" filter="url(#f)" d="${outerPath} ${innerPath}"/>`,
    "</svg>",
  ].join("");
  const url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  if (cache.size > 8) cache.clear();
  cache.set(key, url);
  return url;
}
