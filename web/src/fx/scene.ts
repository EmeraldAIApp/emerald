// Where the window and the moon sit in each plate, as fractions of the plate (measured by eye on the 1280 px JPGs;
// the snow is masked by the plate's own luminance, so the window box can be generous: mullions and wall stay dark).
export interface PlateScene {
  /** Window glass box: x0, y0, x1, y1. */
  win: [number, number, number, number]
  /** Moon center x, y and radius (fraction of the plate width). */
  moon: [number, number, number]
}

export const SCENES: Record<string, PlateScene> = {
  'hero-desktop': { win: [0.385, 0, 0.722, 0.535], moon: [0.527, 0.214, 0.12] },
  'hero-mobile': { win: [0.585, 0, 1, 0.41], moon: [0.787, 0.1, 0.16] },
  'lineup-desktop': { win: [0.34, 0, 0.62, 0.47], moon: [0.469, 0.124, 0.08] },
  'book-desktop': { win: [0.53, 0, 1, 0.56], moon: [0.867, 0.04, 0.09] },
  'token-desktop': { win: [0.62, 0, 1, 0.57], moon: [0.945, 0.05, 0.075] },
  'roadmap-desktop': { win: [0.67, 0, 1, 0.65], moon: [0.898, 0.43, 0.08] },
}
