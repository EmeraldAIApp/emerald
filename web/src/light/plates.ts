// Measured geometry of each plate (scripts/measure-plates.py writes it to plates.generated.ts).
import type { Pt, Quad } from './geometry.js'

export interface PlateLight { sx: string; sy: string; wx: string; wy: string }

export interface PlateGeo {
  /** Plate size in px (2688×1520 or 1520×2688). */
  w: number
  h: number
  /** The 4 corners of the bracelet screen glass (tl, tr, br, bl), in plate px. */
  screen: Quad
  /** Lineup: centers of the 6 dark screens (they show "…"). */
  dots?: Pt[]
  /** Lineup desktop: where the numbers 1..7 go on the table. */
  marks?: Pt[]
  /** Reactive plates (hero, how): light variables, copied from <name>-light.json. */
  light?: PlateLight
}
