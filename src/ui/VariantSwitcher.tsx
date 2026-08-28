import type { VariantId } from '../session/SessionService'

interface VariantSwitcherProps {
  currentVariant: VariantId
  hasVariantB: boolean
  onCreateVariant: () => void
  onSelectVariant: (variantId: VariantId) => void
}

export function VariantSwitcher({
  currentVariant,
  hasVariantB,
  onCreateVariant,
  onSelectVariant,
}: VariantSwitcherProps) {
  return (
    <div className="variant-switcher">
      <div>
        <p className="eyebrow">Immediate comparison</p>
        <strong>A/B variants</strong>
      </div>
      <div className="variant-buttons" role="group" aria-label="Select patch variant">
        {(['A', 'B'] as const).map((variantId) => (
          <button
            aria-pressed={currentVariant === variantId}
            className={currentVariant === variantId ? 'variant-button active' : 'variant-button'}
            data-testid={`variant-${variantId.toLowerCase()}`}
            disabled={variantId === 'B' && !hasVariantB}
            key={variantId}
            onClick={() => onSelectVariant(variantId)}
            type="button"
          >
            <span>Variant</span>
            <strong>{variantId}</strong>
          </button>
        ))}
      </div>
      <button
        className="button button-create-variant"
        data-testid="create-variant-b"
        disabled={hasVariantB}
        onClick={onCreateVariant}
        type="button"
      >
        {hasVariantB ? 'B created' : 'Create wider B'}
      </button>
    </div>
  )
}
