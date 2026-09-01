import type { VariantId } from '../session/SessionService'

export interface VariantSwitcherProps {
  currentVariant: VariantId
  hasVariantB: boolean
  onCreateVariant: () => void
  onSelectVariant: (variantId: VariantId) => void
}

export function VariantButton({ variantId, currentVariant, hasVariantB, onCreateVariant, onSelectVariant }: VariantSwitcherProps & { variantId: VariantId }) {
  return <button
    aria-label={variantId === 'B' && !hasVariantB ? 'Create patch variant B' : `Select patch variant ${variantId}`}
    aria-pressed={currentVariant === variantId}
    className={currentVariant === variantId ? 'variant-button active' : 'variant-button'}
    data-available={variantId === 'A' || hasVariantB}
    data-testid={`variant-${variantId.toLowerCase()}`}
    onClick={() => variantId === 'B' && !hasVariantB ? onCreateVariant() : onSelectVariant(variantId)}
    type="button"
  ><strong>{variantId}</strong></button>
}

export function VariantSwitcher({
  currentVariant,
  hasVariantB,
  onCreateVariant,
  onSelectVariant,
}: VariantSwitcherProps) {
  return (
    <div className="variant-switcher" role="group" aria-label="Patch variants">
      <span className="toolbar-label">Variant</span>
      <div className="variant-buttons">
        {(['A', 'B'] as const).map((variantId) => <VariantButton {...{ currentVariant, hasVariantB, onCreateVariant, onSelectVariant, variantId }} key={variantId} />)}
      </div>
    </div>
  )
}
