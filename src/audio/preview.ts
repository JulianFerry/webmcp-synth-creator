import type { SupportedPatchPath } from '../patch/paths'
import { parsePatchPathValue, setPatchPathValue } from '../patch/paths'
import type { PatchState } from '../patch/types'

export type AudioPreviewScope =
  | 'active-and-future-voices'
  | 'future-note-on'
  | 'draft-only'
  | 'commit-only'

export interface AudioPreviewBehavior {
  scope: AudioPreviewScope
  semantics: string
}

export type AudioPreviewValues = Partial<Record<SupportedPatchPath, unknown>>

const ACTIVE = {
  scope: 'active-and-future-voices',
  semantics: 'Updates sounding voices immediately and applies to notes started during the gesture.',
} as const satisfies AudioPreviewBehavior

export const AUDIO_PREVIEW_BEHAVIORS: Partial<
  Record<SupportedPatchPath, AudioPreviewBehavior>
> = {
  'oscillators.0.wavetablePosition': ACTIVE,
  'oscillators.0.level': ACTIVE,
  'oscillators.0.transposeSemitones': ACTIVE,
  'oscillators.0.fineTuneCents': ACTIVE,
  'oscillators.0.unisonVoices': ACTIVE,
  'oscillators.0.unisonDetune': ACTIVE,
  'oscillators.0.stereoSpread': ACTIVE,
  'oscillators.1.wavetablePosition': ACTIVE,
  'oscillators.1.level': ACTIVE,
  'oscillators.1.transposeSemitones': ACTIVE,
  'oscillators.1.fineTuneCents': ACTIVE,
  'oscillators.1.unisonVoices': ACTIVE,
  'oscillators.1.unisonDetune': ACTIVE,
  'oscillators.1.stereoSpread': ACTIVE,
  'ampEnvelope.attackSeconds': {
    scope: 'draft-only',
    semantics: 'Updates the draft envelope graph during the gesture; the committed value starts with the next note.',
  },
  'ampEnvelope.decaySeconds': {
    scope: 'draft-only',
    semantics: 'Updates the draft envelope graph during the gesture; the committed value starts with the next note.',
  },
  'ampEnvelope.sustainLevel': ACTIVE,
  'ampEnvelope.releaseSeconds': {
    scope: 'draft-only',
    semantics: 'Updates the draft graph only; after commit, a held voice uses the value at its subsequent note-off.',
  },
  'filter.cutoffHz': ACTIVE,
  'filter.resonance': ACTIVE,
  'voice.polyphony': {
    scope: 'commit-only',
    semantics: 'Commits before trimming voices because a preview steal cannot be reversed safely.',
  },
  'voice.glideSeconds': {
    scope: 'future-note-on',
    semantics: 'Applies to note transitions started during the gesture; held pitches are not retriggered.',
  },
  'voice.velocitySensitivity': {
    scope: 'future-note-on',
    semantics: 'Applies to notes started during the gesture; sounding notes retain their note-on velocity gain.',
  },
}

export function getAudioPreviewBehavior(
  path: SupportedPatchPath,
): AudioPreviewBehavior | null {
  return AUDIO_PREVIEW_BEHAVIORS[path] ?? null
}

export function supportsLiveAudioPreview(path: SupportedPatchPath): boolean {
  const behavior = getAudioPreviewBehavior(path)
  return (
    behavior?.scope === 'active-and-future-voices' || behavior?.scope === 'future-note-on'
  )
}

export function supportsDraftPreview(path: SupportedPatchPath): boolean {
  const behavior = getAudioPreviewBehavior(path)
  return behavior !== null && behavior.scope !== 'commit-only'
}

function createPatchWithPreviewValues(
  canonicalPatch: PatchState,
  previewValues: AudioPreviewValues,
  includePath: (path: SupportedPatchPath) => boolean,
): PatchState {
  const patch = structuredClone(canonicalPatch)
  for (const [rawPath, value] of Object.entries(previewValues)) {
    const path = rawPath as SupportedPatchPath
    if (!includePath(path)) continue
    setPatchPathValue(patch, path, parsePatchPathValue(path, value))
  }
  return patch
}

export function createDraftAudioPatch(
  canonicalPatch: PatchState,
  previewValues: AudioPreviewValues,
): PatchState {
  return createPatchWithPreviewValues(canonicalPatch, previewValues, () => true)
}

export function createEffectiveAudioPatch(
  canonicalPatch: PatchState,
  previewValues: AudioPreviewValues,
): PatchState {
  return createPatchWithPreviewValues(canonicalPatch, previewValues, supportsLiveAudioPreview)
}
