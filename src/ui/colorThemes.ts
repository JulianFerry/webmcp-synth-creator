export type PatchVariant = 'A' | 'B'

interface ThemeColorValue {
  hex: string
  rgb: readonly [number, number, number]
}

export const PATCH_COLORS = {
  A: { hex: '#27b3c2', rgb: [39, 179, 194] },
  B: { hex: '#7e5ac7', rgb: [126, 90, 199] },
} as const satisfies Record<PatchVariant, { hex: string; rgb: readonly [number, number, number] }>

export const SIDEBAR_PATCH_COLORS = {
  A: { hex: '#27b3c2', rgb: [39, 179, 194] },
  B: { hex: '#7e5ac7', rgb: [126, 90, 199] },
} as const satisfies Record<PatchVariant, { hex: string; rgb: readonly [number, number, number] }>

export function themedGraphColor(element: Element): ThemeColorValue | null {
  const shell = element.closest<HTMLElement>('.workbench-shell')
  return PATCH_COLORS[shell?.dataset.patchVariant === 'B' ? 'B' : 'A']
}

export function themedGraphEndColor(): ThemeColorValue {
  return colorValue('#ff9f4a')
}

export function colorValue(hex: string): ThemeColorValue {
  return {
    hex,
    rgb: [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ],
  }
}

export function observePatchTheme(element: Element, onChange: () => void): () => void {
  const shell = element.closest<HTMLElement>('.workbench-shell')
  if (!shell) return () => undefined
  const observer = new MutationObserver(onChange)
  observer.observe(shell, {
    attributeFilter: ['data-patch-variant'],
    attributes: true,
  })
  return () => observer.disconnect()
}
