import { useEffect, useRef } from 'react'

import type { BrowserSynthState } from '../audio/BrowserSynth'
interface AuditionPanelProps {
  audio: BrowserSynthState
  onNoteOn: (midi: number, velocity?: number, requestedAtMs?: number) => Promise<void>
  onNoteOff: (midi: number) => void
  onReleaseAll: () => void
}

const NOTE_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const COMPUTER_KEYS = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', 'q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i'] as const
const KEYBOARD_NOTES = Array.from({ length: 25 }, (_, offset) => {
  const midi = 48 + offset
  const label = NOTE_LABELS[midi % 12]
  return { midi, label, key: COMPUTER_KEYS[offset] ?? null, accidental: label.includes('#') }
})

const MIDI_BY_KEY = new Map<string, number>(
  KEYBOARD_NOTES.filter((note) => note.key).map((note) => [note.key as string, note.midi]),
)

const NON_EDITABLE_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'radio',
  'range',
  'reset',
  'submit',
])

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('textarea, select, [contenteditable]:not([contenteditable="false"])')) {
    return true
  }

  const input = target.closest('input')
  return input instanceof HTMLInputElement && !NON_EDITABLE_INPUT_TYPES.has(input.type)
}

function formatTiming(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(1)} ms`
}

export function AuditionPanel({
  audio,
  onNoteOn,
  onNoteOff,
  onReleaseAll,
}: AuditionPanelProps) {
  const activeComputerKeys = useRef(new Set<string>())
  const activePointerNotes = useRef(new Map<number, number>())
  const activeButtonNotes = useRef(new Set<string>())
  const arpTimer = useRef<number | null>(null)
  const previewGeneration = useRef(0)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      const midi = MIDI_BY_KEY.get(key)
      if (midi === undefined || event.repeat || isEditableTarget(event.target)) return
      event.preventDefault()
      activeComputerKeys.current.add(key)
      void onNoteOn(midi, 1, performance.now()).then(() => {
        if (!activeComputerKeys.current.has(key)) onNoteOff(midi)
      })
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      const midi = MIDI_BY_KEY.get(key)
      if (midi === undefined || !activeComputerKeys.current.has(key)) return
      event.preventDefault()
      activeComputerKeys.current.delete(key)
      onNoteOff(midi)
    }
    const releaseKeys = () => {
      previewGeneration.current += 1
      if (arpTimer.current !== null) window.clearTimeout(arpTimer.current)
      arpTimer.current = null
      activeComputerKeys.current.clear()
      activePointerNotes.current.clear()
      activeButtonNotes.current.clear()
      onReleaseAll()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseKeys()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseKeys)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseKeys)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      releaseKeys()
    }
  }, [onNoteOff, onNoteOn, onReleaseAll])

  const startButtonNote = (midi: number, key: string) => {
    const token = `${midi}:${key}`
    activeButtonNotes.current.add(token)
    void onNoteOn(midi, 1, performance.now()).then(() => {
      if (!activeButtonNotes.current.has(token)) onNoteOff(midi)
    })
  }

  const releaseButtonNote = (midi: number, key: string) => {
    activeButtonNotes.current.delete(`${midi}:${key}`)
    onNoteOff(midi)
  }

  const startPointerNote = (event: React.PointerEvent<HTMLButtonElement>, midi: number) => {
    event.preventDefault()
    activePointerNotes.current.set(event.pointerId, midi)
    event.currentTarget.setPointerCapture(event.pointerId)
    void onNoteOn(midi, 1, performance.now()).then(() => {
      if (activePointerNotes.current.get(event.pointerId) !== midi) onNoteOff(midi)
    })
  }

  const releasePointerNote = (event: React.PointerEvent<HTMLButtonElement>, midi: number) => {
    activePointerNotes.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onNoteOff(midi)
  }

  const previewPattern = (kind: 'note' | 'chord' | 'arpeggiator') => {
    previewGeneration.current += 1
    const generation = previewGeneration.current
    if (arpTimer.current !== null) window.clearTimeout(arpTimer.current)
    arpTimer.current = null
    onReleaseAll()
    if (kind === 'note') void onNoteOn(60, 1, performance.now())
    if (kind === 'chord') [60, 63, 67].forEach((midi) => void onNoteOn(midi, 1, performance.now()))
    if (kind === 'arpeggiator') {
      const notes = [60, 63, 67, 72, 67, 63]
      let index = 0
      const tick = () => {
        if (previewGeneration.current !== generation) return
        onReleaseAll()
        void onNoteOn(notes[index], 1, performance.now())
        index = (index + 1) % notes.length
        arpTimer.current = window.setTimeout(tick, 180)
      }
      tick()
    }
  }

  const stopPreview = () => {
    previewGeneration.current += 1
    if (arpTimer.current !== null) window.clearTimeout(arpTimer.current)
    arpTimer.current = null
    onReleaseAll()
  }

  return (
    <footer aria-label="Permanent audition keyboard" className="audition-footer">
      <div className="keyboard-column">
        <div className="footer-keyboard-heading"><span>Two-octave keyboard</span><strong>Lower Z-M / Upper Q-I</strong></div>
          <div
            aria-label="Two octave keyboard, lower row Z through M and upper row Q through I"
            className="note-keyboard"
            data-testid="keyboard-surface"
            tabIndex={0}
          >
            {KEYBOARD_NOTES.map((note) => {
              const active = audio.activeNotes.includes(note.midi)
              return (
                <button
                  aria-label={`${note.label} ${Math.floor(note.midi / 12) - 2}${note.key ? `, keyboard ${note.key.toUpperCase()}` : ''}`}
                  className={`${note.accidental ? 'note-key accidental' : 'note-key'}${active ? ' active' : ''}`}
                  data-midi={note.midi}
                  data-testid={`note-${note.midi}`}
                  key={note.midi}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
                      event.preventDefault()
                      startButtonNote(note.midi, event.key)
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      releaseButtonNote(note.midi, event.key)
                    }
                  }}
                  onPointerCancel={(event) => releasePointerNote(event, note.midi)}
                  onPointerDown={(event) => startPointerNote(event, note.midi)}
                  onPointerUp={(event) => releasePointerNote(event, note.midi)}
                  type="button"
                >
                  <span>{note.label}</span>
                  <small>{note.key?.toUpperCase() ?? Math.floor(note.midi / 12) - 2}</small>
                </button>
              )
            })}
          </div>
      </div>

      <div className="footer-preview-controls">
        <div className="footer-preview-heading"><span>Quick preview</span><div className="voice-meter" aria-live="polite"><strong data-testid="active-voice-count">{audio.activeVoiceCount}</strong><small>/{audio.polyphony}</small></div></div>
        <div className="preview-mode-buttons">
          <button data-testid="preview-note" onClick={() => previewPattern('note')} type="button"><span>Note</span><small>C3</small></button>
          <button data-testid="preview-chord" onClick={() => previewPattern('chord')} type="button"><span>Chord</span><small>C min</small></button>
          <button data-testid="preview-arpeggiator" onClick={() => previewPattern('arpeggiator')} type="button"><span>Arp</span><small>1/16</small></button>
          <button aria-label="Stop preview and release all notes" className="button button-quiet" data-testid="preview-stop" onClick={stopPreview} type="button"><span>Stop</span><small>All notes</small></button>
        </div>
      </div>

      <div className="visually-hidden">
          {audio.lastNoteOnTiming ? (
            <div className="note-timing-readout" data-testid="note-on-timing">
              <span>Last note-on · MIDI {audio.lastNoteOnTiming.midi}</span>
              <strong>
                {formatTiming(audio.lastNoteOnTiming.inputToVoiceReadyMs)} input → voice ready
              </strong>
              <small>
                Audio ready {formatTiming(audio.lastNoteOnTiming.audioReadyMs)} · voice graph{' '}
                {formatTiming(audio.lastNoteOnTiming.voiceGraphBuildMs)} · base{' '}
                {formatTiming(audio.lastNoteOnTiming.baseLatencyMs)} · output{' '}
                {formatTiming(audio.lastNoteOnTiming.outputLatencyMs)} · quantum{' '}
                {formatTiming(audio.lastNoteOnTiming.renderQuantumMs)}
              </small>
              <small>
                Attack {formatTiming(audio.lastNoteOnTiming.attackMs)} · estimated output: first sample{' '}
                {formatTiming(audio.lastNoteOnTiming.estimatedFirstSampleMs)} · envelope −40 dB{' '}
                {formatTiming(audio.lastNoteOnTiming.estimatedEnvelopeMinus40DbMs)} · −20 dB{' '}
                {formatTiming(audio.lastNoteOnTiming.estimatedEnvelopeMinus20DbMs)} ·{' '}
                {audio.lastNoteOnTiming.estimateSource}
              </small>
            </div>
          ) : null}
        <span data-testid="stolen-voice-count">{audio.stolenVoiceCount} click-safe steals</span>
      </div>
    </footer>
  )
}
