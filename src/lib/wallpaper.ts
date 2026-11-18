export type WallpaperId = "alpine" | "aurora" | "mesh" | "grid" | "solid" | "custom";

export interface WallpaperSettings {
  id: WallpaperId;
  /** Custom image URL or data URL. */
  image: string;
  /** Solid colour for the "solid" preset. */
  color: string;
  /** 0-100 */
  opacity: number;
  /** 0-40 px */
  blur: number;
  /** 0-80 percent scrim */
  dim: number;
  parallax: boolean;
}

export const DEFAULT_WALLPAPER: WallpaperSettings = {
  id: "alpine",
  image: "",
  color: "#1b1046",
  opacity: 100,
  blur: 0,
  dim: 14,
  parallax: true,
};

export const isWallpaperId = (value: unknown): value is WallpaperId =>
  value === "alpine" ||
  value === "aurora" ||
  value === "mesh" ||
  value === "grid" ||
  value === "solid" ||
  value === "custom";

export const WALLPAPERS: { id: WallpaperId; name: string; note: string; preview: string }[] = [
  {
    id: "alpine",
    name: "Alpine",
    note: "Animated mountain scene",
    preview: "linear-gradient(160deg,#0b0b33,#2a1a63 42%,#6d3b95 66%,#e5688a 84%,#ffb58e)",
  },
  {
    id: "aurora",
    name: "Aurora",
    note: "Polar glow",
    preview:
      "radial-gradient(circle at 24% 18%, #2ff5c0, transparent 46%), radial-gradient(circle at 78% 30%, #7b6bff, transparent 48%), linear-gradient(160deg,#030515,#0b3b5c)",
  },
  {
    id: "mesh",
    name: "Mesh",
    note: "Soft colour fields",
    preview:
      "radial-gradient(circle at 18% 22%, #ff8fb8, transparent 46%), radial-gradient(circle at 82% 26%, #7c6cff, transparent 44%), radial-gradient(circle at 46% 88%, #ffc38a, transparent 48%), #140b33",
  },
  {
    id: "grid",
    name: "Grid",
    note: "Technical blueprint",
    preview:
      "linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(160deg,#0a0b22,#241a4d)",
  },
  {
    id: "solid",
    name: "Solid",
    note: "One calm colour",
    preview: "linear-gradient(160deg,#241447,#120a2b)",
  },
  {
    id: "custom",
    name: "Custom",
    note: "Your own image",
    preview:
      "repeating-linear-gradient(135deg, rgba(255,255,255,.16) 0 10px, rgba(255,255,255,.05) 10px 20px)",
  },
];

/** Downscale and compress an uploaded wallpaper before storing it locally. */
export async function prepareWallpaper(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image could not be decoded."));
      el.src = dataUrl;
    });
    const max = 2200;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, width, height);
    const compressed = canvas.toDataURL("image/jpeg", 0.82);
    return compressed.length < dataUrl.length ? compressed : dataUrl;
  } catch {
    return dataUrl;
  }
}

export function wallpaperCss(settings: WallpaperSettings): string {
  switch (settings.id) {
    case "aurora":
      return [
        "radial-gradient(ellipse 55% 45% at 20% 18%, rgba(47,245,192,.55), transparent 60%)",
        "radial-gradient(ellipse 50% 45% at 82% 26%, rgba(123,107,255,.55), transparent 62%)",
        "radial-gradient(ellipse 60% 40% at 56% 90%, rgba(26,122,160,.5), transparent 65%)",
        "linear-gradient(165deg,#02040f,#061a36 45%,#083b50)",
      ].join(", ");
    case "mesh":
      return [
        "radial-gradient(ellipse 50% 46% at 16% 20%, rgba(255,143,184,.62), transparent 62%)",
        "radial-gradient(ellipse 46% 44% at 84% 24%, rgba(124,108,255,.62), transparent 64%)",
        "radial-gradient(ellipse 52% 46% at 44% 92%, rgba(255,195,138,.55), transparent 66%)",
        "linear-gradient(160deg,#120a2e,#1d1140)",
      ].join(", ");
    case "grid":
      return [
        "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
        "radial-gradient(ellipse 60% 50% at 50% 28%, rgba(124,108,255,.35), transparent 70%)",
        "linear-gradient(160deg,#07081c,#1c1440)",
      ].join(", ");
    case "solid":
      return settings.color || "#1b1046";
    default:
      return "";
  }
}
