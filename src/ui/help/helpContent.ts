import type { WorkbenchTab } from '../../app/uiState'

export interface HelpArticle {
  body: string
  eyebrow: string
  tip?: string
  title: string
}

export type GuidePath = 'just-play' | 'create-synth'

export interface GuideStep extends HelpArticle {
  selector: string
  tab?: WorkbenchTab
}

const CONTROL_COPY: Record<string, string> = {
  Attack: 'Sets how quickly the sound rises after a note begins. Short attacks feel immediate; longer attacks fade in.',
  Cutoff: 'Sets the filter frequency. Lower values remove more high-frequency content and usually make the patch sound darker.',
  Decay: 'Sets how long the sound takes to move from its initial peak to the sustain level.',
  Detune: 'Spreads the unison voices slightly apart in pitch. It has no audible effect with a single unison voice; add voices with Unison first, then raise Detune for width and movement.',
  Division: 'Sets the speed as a musical note length. For example, 1/4 repeats once per quarter note, while 1/8 moves twice as quickly. Triplet choices create a rolling, less square rhythm.',
  Feedback: 'Controls how much of each delay repeat is sent back through the delay. Low values make a few quiet echoes; high values create a long trail of repeats.',
  Fine: 'Offsets pitch in cents for subtle tuning, beating, and width adjustments.',
  Hold: 'Keeps the envelope at its peak for a fixed time before the decay stage begins.',
  Level: 'Controls how loudly this oscillator contributes to the combined patch.',
  Mix: 'Controls how much of this effect you hear alongside the original sound. At 0% the effect is inaudible; raising it makes the processed sound more prominent.',
  Phase: 'Sets phase in degrees. For an oscillator, it controls how much the starting phase can vary; for an LFO, it shifts where the shape begins without changing its speed.',
  Position: 'Moves through the different frames stored in a wavetable, changing the oscillator tone. Use 2D to inspect the current waveform or 3D to see all frames and where the current position sits among them. A one-frame wavetable stays static.',
  Release: 'Sets how long the sound continues fading after a note is released.',
  Resonance: 'Adds a peak around the filter cutoff. A little gives the tone more focus; high values can sound sharp, whistling, or electronic.',
  'Shape mode': 'Changes how the LFO travels between its points. Smooth rounds the movement into curves; Precise follows the drawn point transitions more directly for firmer rhythmic shapes.',
  Size: 'Changes how large the simulated reverb space feels. Smaller settings resemble a compact room; larger settings create a broader, more spacious wash.',
  Sustain: 'Sets the level held while a note remains pressed after the attack and decay stages finish.',
  Time: 'Sets the delay time between the original sound and each repeat.',
  Transpose: 'Moves this oscillator in semitone steps for octave, interval, or detuned layers.',
  Type: 'Chooses how this part of the synth behaves. The available choices are named for the kind of sound shaping they perform.',
  Unison: 'Layers several copies of this oscillator on every note. More voices make the sound denser; the Detune control spreads those voices in pitch, and one voice means Detune has no effect.',
  Wavetable: 'Chooses the oscillator source and therefore the basic character of the sound. Simple shapes are clean and familiar; richer tables contain more harmonics and can change as Position moves through them.',
}

const EFFECT_COPY: Record<string, { body: string; tip: string }> = {
  chorus: {
    body: 'Adds closely tuned copies of the sound that gently move against the original. This can make a patch feel wider, softer, and more animated.',
    tip: 'Use a small amount for subtle stereo width or more for an obvious shimmering motion.',
  },
  compressor: {
    body: 'Reduces the difference between louder and quieter moments. It can make a patch feel steadier, denser, and easier to hear without simply turning everything up.',
    tip: 'Compression is most useful when some notes or peaks jump out much more than the rest.',
  },
  delay: {
    body: 'Creates audible echoes after the original sound. Timing controls the rhythm of the echoes, Feedback controls how long they continue, and Mix controls how much echo you hear.',
    tip: 'Short, quiet delays add depth; tempo-synced delays can become a noticeable rhythmic part of the patch.',
  },
  distortion: {
    body: 'Adds new harmonics by pushing the signal, making it sound rougher, brighter, warmer, or more aggressive depending on the amount and source sound.',
    tip: 'A small amount can add presence even when you do not want an obviously distorted sound.',
  },
  filter: {
    body: 'Shapes the tone by keeping or reducing different frequency ranges. It is the main place to make a patch darker, thinner, softer, or more focused.',
    tip: 'Start with the cutoff, then add resonance if you want more emphasis around that cutoff point.',
  },
  reverb: {
    body: 'Places the patch in a simulated space and adds a fading tail after the sound. Mix controls the balance between the dry patch and reverb, while Size and Decay shape the space and tail.',
    tip: 'Use less reverb for a close, clear sound and more for pads, atmospheres, and distant textures.',
  },
}

export const GUIDE_STEPS: Record<GuidePath, readonly GuideStep[]> = {
  'just-play': [
    {
      selector: '.footer-preview-controls',
      eyebrow: 'Just play / 01',
      title: 'Hear the patch immediately',
      body: 'Use Note, Chord, or Arp for a hands-free preview. Each mode keeps playing so you can adjust the sound while listening.',
      tip: 'Use Stop before switching patches if you want a clean comparison.',
    },
    {
      selector: '[data-testid="keyboard-surface"]',
      eyebrow: 'Just play / 02',
      title: 'Play the two-octave keyboard',
      body: 'Click or press the on-screen keys, or use Z-M for the lower octave and Q-I for the upper octave on your computer keyboard.',
      tip: 'The keyboard stays available while you move between the Oscillators and Effects tabs.',
    },
    {
      selector: '.sidebar-preset-row',
      eyebrow: 'Just play / 03',
      title: 'Try a different starting patch',
      body: 'The patch menu loads a complete curated sound. It is the fastest way to explore pads, basses, leads, plucks, and calibration patches.',
      tip: 'Loading a patch can be undone, so experimentation is safe.',
    },
    {
      selector: '.variant-comparison',
      eyebrow: 'Just play / 04',
      title: 'Compare A and B',
      body: 'Variant A is your current direction. Create or select B to keep an alternative nearby and switch between them while auditioning.',
      tip: 'Use Preview for a one-second C3, or copy one variant into the other before exploring a new direction.',
    },
    {
      selector: '.help-select-button',
      eyebrow: 'Just play / 05',
      title: 'Ask what anything does',
      body: 'The question-mark help button lets you choose any part of the workbench and read a plain-language explanation without leaving the app.',
      tip: 'After choosing something, it stays highlighted and usable so you can try the controls while reading the explanation.',
    },
  ],
  'create-synth': [
    {
      selector: '.sidebar-preset-row',
      eyebrow: 'Create synth / 01',
      title: 'Choose a foundation',
      body: 'Start from a curated patch, a calibration patch, or an imported Vital preset. Every edit after this changes the same live patch state.',
      tip: 'A simple starting sound makes it easier to hear what each edit contributes.',
    },
    {
      selector: '[data-testid="oscillator-1-editor"]',
      eyebrow: 'Create synth / 02',
      title: 'Build the tone at the oscillator',
      body: 'Choose a wavetable, move through its frames, set level and tuning, then add unison and detune for density and width.',
      tip: 'Start with Oscillator 1. Add the other oscillators only when the sound needs another layer.',
      tab: 'oscillators',
    },
    {
      selector: '.envelope-panel',
      eyebrow: 'Create synth / 03',
      title: 'Shape the note over time',
      body: 'The amplitude envelope controls how every note starts, settles, sustains, and fades. Drag the graph handles or use the controls below it.',
      tip: 'Short attack and release values feel percussive; longer values create pads and swells.',
      tab: 'oscillators',
    },
    {
      selector: '.lfo-panel',
      eyebrow: 'Create synth / 04',
      title: 'Add repeating movement with the Low Frequency Oscillator',
      body: 'The Low Frequency Oscillator draws a shape that repeats over time. Its points define the movement, Division sets the rhythm, and Phase chooses where each new note starts in that shape.',
      tip: 'A Low Frequency Oscillator is not another audible oscillator. It automatically moves connected synth controls to add rhythm and motion to the sound.',
      tab: 'oscillators',
    },
    {
      selector: '#tab-modulation-effects',
      eyebrow: 'Create synth / 05',
      title: 'Color the signal with effects',
      body: 'Open the Effects tab to process the combined oscillator signal. Filter the tone, add space with delay and reverb, and drag processors to change their order.',
      tip: 'Effect order matters because each processor receives the output of the one before it.',
    },
    {
      selector: '.history-controls',
      eyebrow: 'Create synth / 06',
      title: 'Step backward or forward through edits',
      body: 'Undo reverses your most recent complete edit, and Redo reapplies an edit you just undid. This makes it safe to experiment with the patch and compare a change with what came before it.',
      tip: 'A coordinated change remains one history step, even when it adjusts several controls together.',
    },
    {
      selector: '.variant-comparison',
      eyebrow: 'Create synth / 07',
      title: 'Keep an alternative',
      body: 'Use A/B comparison before a risky change or when you want to explore a second direction without losing the first.',
      tip: 'Undo works within the selected variant; A and B keep separate patch histories.',
    },
    {
      selector: '[data-testid="export-vital"]',
      eyebrow: 'Create synth / 08',
      title: 'Export the finished instrument',
      body: 'Export writes the current patch as a .vital preset. Load it in Vital to keep playing or editing the finished instrument.',
      tip: 'The exported file uses the selected A or B variant.',
    },
    {
      selector: '.help-select-button',
      eyebrow: 'Create synth / 09',
      title: 'Get help while you build',
      body: 'Use the question-mark help button whenever a synth term or control is unfamiliar. Choose the item and its explanation will open beside it.',
      tip: 'The highlighted component remains usable in the focused explanation, so you can listen and learn by trying it.',
    },
  ],
}

function closest(element: Element, selector: string): Element | null {
  return element.matches(selector) ? element : element.closest(selector)
}

function controlLabel(element: Element): string | null {
  const control = closest(element, '.parameter-control, .select-control')
  const visibleLabel = control?.querySelector(':scope > span')?.textContent?.trim()
  if (visibleLabel) return visibleLabel
  const toggle = closest(element, '[role="switch"]')
  return toggle?.getAttribute('aria-label')?.trim() || null
}

function componentName(element: Element): string | null {
  return element.closest('article, section, aside, footer')?.querySelector('h2, h1')?.textContent?.trim() || null
}

function article(eyebrow: string, title: string, body: string, tip?: string): HelpArticle {
  return { eyebrow, title, body, tip }
}

function controlCopy(label: string, parent: string | null): { body: string; title: string } {
  if (parent?.startsWith('Oscillator ')) {
    if (label === 'Phase') return { title: 'Random phase control', body: CONTROL_COPY[label] }
    if (label === 'Unison') return { title: 'Unison voices control', body: CONTROL_COPY[label] }
    if (label === 'Fine') return { title: 'Fine tune control', body: CONTROL_COPY[label] }
  }
  if (label === 'Mode' && parent === 'Filter') {
    return {
      title: 'Filter shape',
      body: 'Chooses which part of the tone the filter keeps. Low-pass keeps the low frequencies for a darker sound, high-pass keeps the highs for a thinner sound, band-pass keeps a middle band, and notch removes a narrow band.',
    }
  }
  if (label === 'Mode' && parent === 'Delay') {
    return {
      title: 'Delay timing',
      body: 'Chooses how echo timing is set. Tempo sync follows musical note lengths so repeats stay with the beat; Free time uses an exact time in milliseconds for timing that does not follow the song tempo.',
    }
  }
  if (label === 'Decay' && parent === 'Reverb') {
    return {
      title: 'Reverb tail',
      body: 'Sets how long the reverb takes to fade away. Short values feel like a small, controlled room; long values create a lingering wash that can join one note to the next.',
    }
  }
  if (label === 'Filter') return { title: 'Filter on or off', body: 'Turns the filter on or bypasses it. When off, the full oscillator tone passes through unchanged; the cutoff, shape, and resonance settings are kept for when you turn it back on.' }
  if (label === 'Delay') return { title: 'Delay on or off', body: 'Turns the echoes on or bypasses them without losing the saved delay timing, feedback, or mix settings.' }
  if (label === 'Reverb') return { title: 'Reverb on or off', body: 'Turns the simulated space and reverb tail on or bypasses them without losing its settings.' }
  if (label === 'LFO') return { title: 'LFO on or off', body: 'Turns repeating LFO movement on or off. The shape and timing remain saved while it is off.' }
  if (label.startsWith('Oscillator ')) return { title: `${label} on or off`, body: `Adds or removes ${label.toLowerCase()} from the patch without losing its wavetable, tuning, or voicing settings.` }
  return { title: `${label} control`, body: CONTROL_COPY[label] ?? `Adjusts ${label.toLowerCase()} for this part of the sound. Try it while a note or preview is playing to hear what changes.` }
}

export function helpArticleFor(element: Element): HelpArticle {
  const label = controlLabel(element)
  if (label) {
    const parent = componentName(element)
    const copy = controlCopy(label, parent)
    const tip = closest(element, 'select')
      ? 'Open the menu and compare the choices while a preview is playing. The change can be undone.'
      : closest(element, '[role="switch"]')
        ? 'Turn it off to compare the patch with and without this part of the sound. Its settings are preserved.'
        : 'Adjust it while a note or preview is playing so you can connect the control with what you hear.'
    return article(parent ?? 'Patch control', copy.title, copy.body, tip)
  }

  const ariaLabel = element.getAttribute('aria-label')?.trim() || ''
  if (closest(element, '[aria-label="Undo transaction"]')) {
    return article('History', 'Undo', 'Reverts the most recent complete patch transaction in the selected variant.', 'One coordinated edit is one undo step, even when it changed several parameters.')
  }
  if (closest(element, '[aria-label="Redo transaction"]')) {
    return article('History', 'Redo', 'Reapplies the most recently undone patch transaction in the selected variant.')
  }
  if (closest(element, '[data-testid="preset-selector"], .header-preset-control')) {
    return article('Patch', 'Starting patch', 'Loads a complete curated or calibration patch as your new foundation.', 'Loading a patch is recorded in history and can be undone.')
  }
  if (closest(element, '[data-testid="import-vital"]')) {
    return article('Patch transfer', 'Import Vital', 'Imports the supported parts of a .vital preset into the selected A or B variant.', 'Unsupported features may be converted lossily and reported in a notice.')
  }
  if (closest(element, '[data-testid="export-vital"]')) {
    return article('Patch transfer', 'Export Vital', 'Downloads the selected patch variant as a .vital preset for use in Vital.', 'Vital uses a different sound engine, so the preset may sound slightly different from the browser preview.')
  }
  if (closest(element, '[data-testid^="preview-variant-"]')) {
    return article('A/B comparison', 'Preview variant', 'Selects this variant, holds C3 for one second, then releases it automatically.', 'Use the same note on A and B for a direct comparison.')
  }
  if (closest(element, '[data-testid^="copy-variant-"]')) {
    return article('A/B comparison', 'Copy variant', 'Replaces the other variant with every patch value from this one as a single transaction.', 'The copy is added only to the target variant history, so select the target to undo it.')
  }
  if (closest(element, '[data-testid^="preview-"]')) {
    const name = element.textContent?.trim().replace(/\s+/g, ' ') || ariaLabel || 'Preview'
    return article('Audition', `${name} preview`, 'Starts or stops a persistent audition pattern so you can hear edits without holding a key.', 'Note plays C3, Chord plays C minor, and Arp cycles through the chord tones.')
  }
  if (closest(element, '.workbench-tab')) {
    const name = element.textContent?.replace(/^\s*0\d\s*/, '').trim() || 'Synth Creator'
    return article('Workspace navigation', `${name} tab`, `Shows the ${name.toLowerCase()} editing workspace. Switching tabs does not interrupt held notes or preview patterns.`)
  }
  if (closest(element, '[role="slider"].graph-handle')) {
    return article('Editable graph', ariaLabel || 'Graph handle', 'Moves one point in the envelope or LFO shape, changing how the sound develops or repeats over time.', 'Drag the point while a preview is playing so you can hear the shape change immediately.')
  }
  if (closest(element, '.detailed-oscillator-waveform')) {
    return article('Oscillator display', 'Wavetable view', 'Visualizes the oscillator waveform at its current wavetable position.', 'Switch between 2D waveform and 3D frame views without changing the sound.')
  }
  const oscillator = closest(element, '.detailed-oscillator-editor')
  if (oscillator) {
    const name = oscillator.querySelector('h2')?.textContent?.trim() || 'Oscillator'
    return article('Sound source', name, 'Generates one layer of the patch. Its wavetable and position defines the harmonic source; level, tuning, and voicing controls determine how it joins the mix.', 'Disabled oscillators keep their settings and can be switched back on later.')
  }
  if (closest(element, '.envelope-plot')) {
    return article('Amplitude envelope', 'Editable ADSR graph', 'Shows and edits how a note rises, decays, sustains, and releases over time.', 'Drag a handle on the graph, or use the four numeric controls for exact edits.')
  }
  if (closest(element, '.envelope-panel')) {
    return article('Modulator', 'Amplitude envelope', 'Controls the loudness contour of every played note from note-on through note-off.', 'The graph and the controls below it edit the same envelope values.')
  }
  if (closest(element, '.lfo-plot, .editable-graph[aria-label*="LFO"]')) {
    return article('Modulator', 'LFO shape', 'Defines a repeating movement pattern that can rhythmically change routed synth parameters.', 'Drag points to reshape it, double-click empty graph space to add a point, or adjust curve handles between points.')
  }
  if (closest(element, '.lfo-panel')) {
    return article('Modulator', 'Low-frequency oscillator', 'Creates repeating movement. Its shape, rate, and phase control how routed parameters change over time.', 'Switch the LFO on before expecting its modulation routes to affect the sound.')
  }
  const effect = closest(element, '[data-effect-id]')
  if (effect) {
    const name = effect.getAttribute('data-effect-id') || 'effect'
    const title = name[0].toUpperCase() + name.slice(1)
    const copy = EFFECT_COPY[name]
    return article('Effects chain', title, copy?.body ?? `Changes the combined synth sound with ${title.toLowerCase()}.`, copy?.tip)
  }
  if (closest(element, '.variant-comparison-card, .variant-button, .variant-spectrum')) {
    const variant = element.closest('.variant-comparison-card-a') ? 'A' : 'B'
    return article('A/B comparison', `Variant ${variant}`, `Selects patch variant ${variant}${variant === 'B' ? ' or creates it when it does not exist yet' : ''}.`, 'A and B let you audition two directions without building a complex version tree.')
  }
  if (closest(element, '.variant-comparison')) {
    return article('Session', 'A/B comparison', 'Keeps two patch directions available for immediate visual and audible comparison.', 'Select a card to edit it, Preview it with a one-second C3, or copy its complete patch into the other variant.')
  }
  if (closest(element, '.sidebar-transfer')) {
    return article('Patch', 'Patch transfer', 'Chooses a starting patch and provides import and export controls for Vital presets.')
  }
  if (closest(element, '.footer-preview-controls')) {
    return article('Audition', 'Quick preview', 'Plays a sustained note, chord, or arpeggio through the current patch while you edit it.')
  }
  if (closest(element, '.note-keyboard')) {
    return article('Audition', 'Two-octave keyboard', 'Plays the current patch across two octaves. Click or press the on-screen keys, or use Z-M for the lower octave and Q-I for the upper octave on your computer keyboard.', 'The keyboard remains available when you switch between the Oscillators and Effects tabs.')
  }
  if (closest(element, '[role="switch"]')) {
    return article('Enable control', ariaLabel || 'On/off switch', 'Enables or bypasses this sound component without discarding its settings.')
  }
  if (closest(element, 'button, [role="button"]')) {
    const name = ariaLabel || element.textContent?.trim().replace(/\s+/g, ' ') || 'Button'
    return article('Action', name, 'Runs the labeled workbench action when activated.')
  }
  return article('Synth Creator action', ariaLabel || 'Synth Creator control', 'Runs this labeled action in the current patch or session.')
}
