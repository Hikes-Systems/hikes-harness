/**
 * Feature flags for the glass rendering.
 *
 * The liquid refraction is parked. It draws an SVG displacement filter and a
 * backdrop blur over the live backdrop, so the browser has to re-rasterise the
 * animated scene on every frame — the mountains stutter and the tab can stop
 * responding on the onboarding screen.
 *
 * Lite is the stable standard for now. This flag is the single switch that
 * brings the liquid path back once it has been reworked.
 */
export const QUALITY: { liquidAvailable: boolean } = {
  liquidAvailable: false,
};
