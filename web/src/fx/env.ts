// Which tier of motion this device gets. "rich" = smooth scroll, parallax, mouse depth, snow and animated grain:
// only on a desktop-class device with a fine pointer and enough cores. Phones and slow machines get the light tier
// (reveals, the verdict wave, the typing), and reduced-motion / ?static get none of it.
import { still } from '../motion.js'

export function richMotion(): boolean {
  if (still()) return false
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return false
  if ((nav.hardwareConcurrency ?? 8) < 4) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false
  return matchMedia('(min-width: 1024px) and (pointer: fine) and (hover: hover)').matches
}
