/**
 * Chart tokens, read from the CSS custom properties in index.css so charts
 * follow the theme toggle rather than hard-coding a mode.
 *
 * The categorical slots are the first three of the validated palette, checked
 * against this app's own surfaces (#ffffff light / #111827 dark) for the
 * lightness band, chroma floor, CVD separation, normal-vision floor and
 * contrast. Light-mode aqua sits below 3:1, so every chart using slot 3 ships
 * visible values (legend totals + tooltip) as the documented relief.
 */

export const SERIES = {
  one: 'rgb(var(--series-1))',
  two: 'rgb(var(--series-2))',
  three: 'rgb(var(--series-3))',
} as const;

export const CHART_INK = {
  primary: 'rgb(var(--ink))',
  secondary: 'rgb(var(--ink-secondary))',
  muted: 'rgb(var(--ink-muted))',
  grid: 'rgb(var(--grid))',
  axis: 'rgb(var(--axis))',
  surface: 'rgb(var(--surface))',
} as const;

/** Recharts axis props shared by every chart, so chrome stays recessive. */
export const AXIS_PROPS = {
  stroke: CHART_INK.axis,
  tick: { fill: CHART_INK.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: CHART_INK.grid,
  strokeWidth: 1,
  // Hairline solid, never dashed.
  vertical: false,
} as const;

/** Bars never fill their band — cap the thickness and let the rest be air. */
export const MAX_BAR_SIZE = 24;

/** The 2px surface gap that separates touching marks. */
export const STACK_GAP = { stroke: CHART_INK.surface, strokeWidth: 2 } as const;
