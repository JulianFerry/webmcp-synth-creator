import { useEffect, useRef, useState } from 'react'

import { AUDITION_HELD_MIDI_NOTE, type BrowserSynthState } from '../audio/BrowserSynth'
import { ParameterSlider } from './controls/ParameterSlider'

interface AuditionPanelProps {
  audio: BrowserSynthState
  onStartAudio: () => Promise<void>
  onNoteOn: (midi: number, velocity?: number, requestedAtMs?: number) => Promise<void>
  onNoteOff: (midi: number) => void
  onReleaseAll: () => void
  onToggleHeldNote: (requestedAtMs?: number) => Promise<void>
}

const KEYBOARD_NOTES = [
  { midi: 48, label: 'C', key: 'a', accidental: false },
  { midi: 49, label: 'C#', key: 'w', accidental: true },
  { midi: 50, label: 'D', key: 's', accidental: false },
  { midi: 51, label: 'D#', key: 'e', accidental: true },
  { midi: 52, label: 'E', key: 'd', accidental: false },
  { midi: 53, label: 'F', key: 'f', accidental: false },
  { midi: 54, label: 'F#', key: 't', accidental: true },
  { midi: 55, label: 'G', key: 'g', accidental: false },
  { midi: 56, label: 'G#', key: 'y', accidental: true },
  { midi: 57, label: 'A', key: 'h', accidental: false },
  { midi: 58, label: 'A#', key: 'u', accidental: true },
  { midi: 59, label: 'B', key: 'j', accidental: false },
  { midi: 60, label: 'C', key: 'k', accidental: false },
] as const

const MIDI_BY_KEY = new Map<string, number>(
  KEYBOARD_NOTES.map((note) => [note.key, note.midi]),
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
  onStartAudio,
  onNoteOn,
  onNoteOff,
  onReleaseAll,
  onToggleHeldNote,
}: AuditionPanelProps) {
  const [velocity, setVelocity] = useState(0.85)
  const activeComputerKeys = useRef(new Set<string>())
  const activePointerNotes = useRef(new Map<number, number>())
  const activeButtonNotes = useRef(new Set<string>())
  const velocityRef = useRef(velocity)
  const committedVelocityRef = useRef(velocity)

  useEffect(() => {
    velocityRef.current = velocity
    committedVelocityRef.current = velocity
  }, [velocity])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const midi = MIDI_BY_KEY.get(key)
      if (midi === undefined || event.repeat || isEditableTarget(event.target)) return
      event.preventDefault()
      activeComputerKeys.current.add(key)
      void onNoteOn(midi, velocityRef.current, performance.now()).then(() => {
        if (!activeComputerKeys.current.has(key)) onNoteOff(midi)
      })
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const midi = MIDI_BY_KEY.get(key)
      if (midi === undefined || !activeComputerKeys.current.has(key)) return
      event.preventDefault()
      activeComputerKeys.current.delete(key)
      onNoteOff(midi)
    }
    const releaseKeys = () => {
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
    void onNoteOn(midi, velocityRef.current, performance.now()).then(() => {
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
    void onNoteOn(midi, velocityRef.current, performance.now()).then(() => {
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

  return (
    <article className="panel audition-panel">
      <div className="panel-heading audition-heading">
        <div>
          <p className="eyebrow">Gesture-gated performance surface</p>
          <h2>Audition</h2>
        </div>
        <div className="voice-meter" aria-live="polite">
          <span>Voices</span>
          <strong data-testid="active-voice-count">{audio.activeVoiceCount}</strong>
          <small>/ {audio.polyphony}</small>
        </div>
      </div>

      <div className="audition-layout">
        <div className="keyboard-column">
          <div className="audio-transport">
            <button
              className="button button-start"
              data-testid="start-audio"
              disabled={audio.lifecycle === 'unavailable'}
              onClick={() => void onStartAudio()}
              type="button"
            >
              {audio.lifecycle === 'running' ? 'Audio running' : 'Start audio'}
            </button>
            <button
              className={audio.held ? 'button hold-control active' : 'button hold-control'}
              data-testid="hold-note"
              onClick={() => void onToggleHeldNote(performance.now())}
              type="button"
            >
              {audio.held ? 'Release C2' : 'Hold C2'}
            </button>
            <button className="button button-quiet" onClick={onReleaseAll} type="button">
              Release all
            </button>
          </div>

          <div
            aria-label="Computer keyboard notes A through K"
            className="note-keyboard"
            data-testid="keyboard-surface"
            tabIndex={0}
          >
            {KEYBOARD_NOTES.map((note) => {
              const active = audio.activeNotes.includes(note.midi)
              return (
                <button
                  aria-label={`${note.label} ${note.midi === AUDITION_HELD_MIDI_NOTE + 12 ? '3' : '2'}, keyboard ${note.key.toUpperCase()}`}
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
                  <small>{note.key.toUpperCase()}</small>
                </button>
              )
            })}
          </div>
          <p className="gesture-note">
            Audio stays suspended until a direct gesture. Play with A-W-S-E-D-F-T-G-Y-H-U-J-K.
          </p>
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
        </div>

        <div className="voice-controls">
          <ParameterSlider
            formatValue={(value) => `${Math.round(value * 100)}%`}
            id="audition-velocity"
            label="Key velocity"
            max={1}
            min={0.05}
            onCancel={() => {
              velocityRef.current = committedVelocityRef.current
            }}
            onCommit={(value) => {
              committedVelocityRef.current = value
              velocityRef.current = value
              setVelocity(value)
            }}
            onPreview={(value) => {
              velocityRef.current = value
            }}
            step={0.01}
            value={velocity}
          />
          <div className="steal-readout">
            <span>Steal policy</span>
            <strong>Oldest voice</strong>
            <small data-testid="stolen-voice-count">{audio.stolenVoiceCount} click-safe steals</small>
          </div>
          <p className="gesture-note polyphony-preview-note">
            Polyphony commits before click-safe trimming. Glide and velocity response affect new
            note-ons, not voices already sounding.
          </p>
        </div>
      </div>
    </article>
  )
}
