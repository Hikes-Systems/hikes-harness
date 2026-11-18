/**
 * Canvas-generated displacement map for the shell's edge lens.
 *
 * Each pixel encodes a vector that points toward the centre of the panel,
 * strongest at the rounded rim and zero in the middle. The shell feeds this
 * into an SVG feDisplacementMap so the wallpaper bends at the glass edge,
 * which is what separates liquid glass from a plain frosted blur.
 */
const cache = new Map<string, string>();

const smoothStep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const roundedRectSDF = (x: number, y: number, halfW: number, halfH: number, radius: number): number => {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
};

export function lensMap(width = 512, height = 336): string {
  const key = `${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const image = context.createImageData(width, height);
  const data = image.data;
  const dxs = new Float32Array(width * height);
  const dys = new Float32Array(width * height);
  let max = 0;
  let index = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ix = (x + 0.5) / width - 0.5;
      const iy = (y + 0.5) / height - 0.5;
      // Contour sits on the panel edge; negative inside.
      const distance = roundedRectSDF(ix, iy, 0.5, 0.5, 0.14);
      // Lens band: ~3% of the panel wraps the rim.
      const band = smoothStep(0.032, 0, Math.abs(distance));
      const pull = band * band;
      // Bend toward the centre. The map is normalised below.
      const dx = -ix * pull * 2;
      const dy = -iy * pull * 2;
      dxs[index] = dx;
      dys[index] = dy;
      max = Math.max(max, Math.abs(dx), Math.abs(dy));
      index++;
    }
  }

  const scale = Math.max(max, 1e-4);
  for (let pixel = 0; pixel < dxs.length; pixel++) {
    const offset = pixel * 4;
    data[offset] = Math.round((dxs[pixel] / scale) * 127.5 + 127.5);
    data[offset + 1] = Math.round((dys[pixel] / scale) * 127.5 + 127.5);
    data[offset + 2] = data[offset + 1];
    data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
