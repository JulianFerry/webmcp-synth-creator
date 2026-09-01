# Wavetable Workbench

## Product Specification & Hackathon Roadmap

**Project:** Wavetable Workbench  
**Target:** WebMCP Challenge  
**Submission deadline:** 3 September 2026, 13:00 PT  
**Primary export target:** Vital `.vital` presets

---

# 1. Product thesis

Wavetable Workbench is a browser-based synthesizer that lets a musician design a real synth preset by talking to an AI.

A user begins with either a natural-language description or a curated starting preset:

> “Create an ethereal gated trance pad.”

The AI creates a playable starting sound.

The user listens and responds naturally:

> “I like it, but make it darker without losing the airy character.”

The AI modifies the **existing patch**.

The user can continue:

> “Make the gate less regular.”

> “Shorten the second pulse.”

> “Give me a wider alternative.”

When satisfied, the user exports a real `.vital` preset and opens it in Vital.

The core loop is:

```text
describe
   ↓
generate / load
   ↓
listen
   ↓
react
   ↓
targeted edit
   ↓
listen
   ↓
iterate
   ↓
export
```

**The collaboration is the product.**

Initial text-to-preset generation is only the entrance. The differentiating capability is maintaining a live synth state across a conversation and allowing the user to direct that sound perceptually until it is right.

---

# 2. Product positioning

Text-to-preset generation already exists elsewhere.

Wavetable Workbench should therefore not be positioned primarily as:

> “AI generates a synth preset.”

It should be positioned as:

> **“Talk to a synthesizer and keep refining the same sound until it is right.”**

The important distinction is:

```text
one-shot generation

prompt
  ↓
preset
  ↓
done
```

versus:

```text
Wavetable Workbench

prompt
  ↓
preset
  ↓
listen
  ↓
feedback
  ↓
edit current state
  ↓
listen
  ↓
feedback
  ↓
edit current state
  ↓
export
```

This stateful editing loop should drive every implementation decision.

---

# 3. Core product principles

## 3.1 The patch is the state

The primary application object is the current `PatchState`.

It is not the latest AI response.

Everything operates on the same state:

- AI edits
- manual UI edits
- browser playback
- undo
- A/B comparison
- analysis
- `.vital` export

Example:

```text
User: “Make it darker.”

Patch v1
   ↓
Patch v2

User: “Now make the release longer.”

Patch v2
   ↓
Patch v3
```

The second instruction must preserve the darker tone introduced by the first.

---

## 3.2 Editing should be conservative

When modifying an existing patch, the agent should prefer the smallest set of changes that achieves the request.

For example:

> “Keep everything else, but make it wider.”

should normally modify:

- unison
- stereo spread
- possibly stereo modulation

It should not unexpectedly replace:

- wavetable
- filter
- envelope
- effects
- modulation architecture

unless doing so is genuinely necessary.

---

## 3.3 One user request should normally equal one transaction

A perceptual instruction may require several related parameter changes.

Example:

> “Make it darker without losing the airy top end.”

might require:

- filter cutoff down
- oscillator position adjusted slightly
- high-frequency layer preserved
- reverb left largely unchanged

Those changes should normally be executed through one atomic operation:

```text
one user instruction
       ↓
one apply_patch()
       ↓
multiple coordinated changes
       ↓
one resulting state
       ↓
one undo step
```

This is important for:

- latency
- tool-call efficiency
- predictable undo
- coherent state
- conversational feel

---

## 3.4 Browser playback uses Vital DSP

Wavetable Workbench runs the pinned Vital synthesis engine in a browser
`AudioWorklet`. Browser playback and `.vital` export consume the same serialized
document produced by `VitalPresetAdapter`; there is no independent browser
synthesis mapping.

```text
                   PatchState
                       │
              VitalPresetAdapter
                       │
                Vital document
                 ┌─────┴─────┐
                 ↓           ↓
          Vital WASM DSP    .vital
                 ↓           ↓
          browser audio   desktop Vital
```

The browser and native same-source renderer are covered by automated fidelity
tests. Desktop Vital 1.0.7 listening remains the final interoperability check.

---

# 4. Primary user journeys

## 4.1 Generate a sound

Primary path.

User:

> “Create an ethereal gated trance pad.”

The AI:

1. interprets the description,
2. creates a sound-design plan,
3. produces a valid `PatchState`,
4. applies it to the Vital WASM renderer,
5. makes the result immediately playable.

---

## 4.2 Start from a preset

Secondary path.

The application ships with a small curated library.

Hackathon target:

**6–12 polished presets**

Longer-term target:

**approximately 30 presets**

Example categories:

- Pads
- Bass
- Leads
- Plucks
- Keys
- Atmospheres
- Rhythmic

The user can choose one and immediately begin conversational editing.

---

## 4.3 Refine conversationally

Example:

> “It's too bright.”

The AI inspects the current patch and makes a small tonal adjustment.

Then:

> “Give it more movement.”

The AI modifies an appropriate modulation source or depth.

Then:

> “Make the second gate shorter.”

The AI edits the existing LFO point structure.

The current patch remains the basis for every subsequent edit.

---

## 4.4 A/B an alternative

User:

> “Give me a wider alternative.”

The app creates:

```text
A = current patch
B = modified copy
```

The user can immediately audition either.

They choose A or B.

The selected version becomes the current patch.

The MVP does **not** implement an arbitrary version tree.

---

## 4.5 Export

The user exports:

```text
My Patch.vital
```

The preset should:

- load successfully in the targeted Vital version,
- contain the required oscillator/wavetable state,
- contain envelopes,
- contain modulation routes,
- contain LFO shapes,
- contain supported effects,
- behave as intended when played in Vital.

---

# 5. Reference demo

The implementation should be built backwards from this demo.

## Step 1 — Generate

User:

> “Create an ethereal gated trance pad.”

The patch appears.

The user plays a chord.

---

## Step 2 — Tonal refinement

User:

> “I like it, but it's too bright. Make it darker without losing the airy character.”

The AI performs one `apply_patch` operation.

The sound changes.

The user plays again.

---

## Step 3 — Structural editing

User:

> “Make the gate less regular and shorten the second pulse.”

The AI modifies the point-based LFO.

The LFO graph visibly changes.

The rhythm audibly changes.

This is a key demo moment because the AI is manipulating a structured musical object rather than merely changing a generic parameter.

The existing prototype already creates custom multi-point Vital LFO data with point coordinates, powers and smoothing information. fileciteturn3file0L7-L24 It also assigns that shape to LFO 1 and routes the LFO into oscillator levels and filter cutoff. fileciteturn4file0L16-L18 fileciteturn4file0L66-L68

The current prototype has therefore already demonstrated the basic custom-LFO serialization path.

---

## Step 4 — A/B

User:

> “Give me a wider alternative.”

The app presents A and B.

The user auditions both and chooses one.

---

## Step 5 — Export

The user exports `.vital`.

The preset is opened in Vital.

The user plays the same chord.

The exported instrument behaves recognizably like the patch developed during the conversation.

---

# 6. Canonical `PatchState`

`PatchState` is the most important internal interface in the application.

The agent must not manipulate raw Vital JSON.

The Vital renderer must not maintain an independent canonical version of the patch.

The Vital exporter must not maintain another independent representation.

Everything begins with:

```ts
interface PatchState {
  version: 1
  metadata: PatchMetadata

  oscillators: [OscillatorState, OscillatorState]

  ampEnvelope: EnvelopeState
  modEnvelope: EnvelopeState

  filter: FilterState
  lfo1: LfoState

  modulations: ModulationRoute[]

  voice: VoiceState

  effects: {
    delay: DelayState
    reverb: ReverbState
  }

  wavetableData: Record<string, WavetableState>
}
```

---

# 7. Units convention

Every logical parameter must have exactly one canonical unit.

Do **not** expose Vital's internal parameter ranges to the AI.

Do **not** normalize values merely for consistency when a useful musical unit exists.

Rules:

### Time

Use seconds.

```ts
attackSeconds: number
releaseSeconds: number
```

### Pitch

Use semitones and cents.

```ts
transposeSemitones: number
fineTuneCents: number
```

### Frequency

Use Hz where the concept represents a real frequency.

```ts
cutoffHz: number
```

### Counts

Use integers.

```ts
unisonVoices: number
polyphony: number
```

### Proportional amounts

Use `0..1`.

Examples:

```ts
level
resonance
stereoSpread
mix
feedback
wavetablePosition
```

### Bipolar modulation amounts

Use `-1..1`.

```ts
amount: number
```

### Tempo-synchronized values

Use semantic musical values rather than numeric indexes.

```ts
"1/4"
"1/8"
"1/8T"
"1/16"
```

Adapters are responsible for translating these into browser/Vital-specific values.

---

# 8. Full state schema

## 8.1 Metadata

```ts
interface PatchMetadata {
  name: string
  category?:
    | "pad"
    | "bass"
    | "lead"
    | "pluck"
    | "keys"
    | "atmosphere"
    | "rhythmic"
    | "other"

  description?: string
  tags: string[]
}
```

---

## 8.2 Oscillator

```ts
interface OscillatorState {
  enabled: boolean

  wavetableId: string
  wavetablePosition: number // 0..1

  level: number // 0..1

  transposeSemitones: number
  fineTuneCents: number

  unisonVoices: number // integer, MVP 1..8
  unisonDetune: number // 0..1
  stereoSpread: number // 0..1

  randomPhase: number // 0..1
}
```

MVP constraints:

```text
2 oscillators maximum
unison voices: 1–8
transpose: -24..+24 semitones
fine tune: -100..+100 cents
```

---

## 8.3 Envelope

```ts
interface EnvelopeState {
  attackSeconds: number
  holdSeconds: number
  decaySeconds: number
  sustainLevel: number // 0..1
  releaseSeconds: number
}
```

MVP recommended limits:

```text
attack: 0..10 seconds
hold: 0..5 seconds
decay: 0..10 seconds
sustain: 0..1
release: 0..20 seconds
```

---

## 8.4 Filter

```ts
type FilterType =
  | "lowpass"
  | "highpass"
  | "bandpass"

interface FilterState {
  enabled: boolean
  type: FilterType

  cutoffHz: number
  resonance: number // 0..1
}
```

Recommended logical cutoff range:

```text
20 Hz .. 20,000 Hz
```

The shared Vital adapter converts this value once for both browser playback and export.

---

## 8.5 LFO

```ts
interface LfoPoint {
  x: number // 0..1 position in cycle
  y: number // 0..1 value
  power?: number
}

type LfoRate =
  | {
      mode: "sync"
      division:
        | "1/1"
        | "1/2"
        | "1/4"
        | "1/8"
        | "1/8T"
        | "1/16"
        | "1/16T"
    }
  | {
      mode: "free"
      hz: number
    }

interface LfoState {
  points: LfoPoint[]
  rate: LfoRate

  phase: number // 0..1
  smooth: boolean
}
```

Requirements:

- points sorted by `x`
- first point at or after `0`
- final point at or before `1`
- at least 2 points
- MVP maximum: 32 points

The UI only needs to **display** this shape.

Direct mouse editing is not required for the challenge submission.

---

# 9. Modulation routes

Logical modulation:

```ts
type ModulationSource =
  | "lfo1"
  | "modEnvelope"

type ModulationDestination =
  | "oscillator1.level"
  | "oscillator1.wavetablePosition"
  | "oscillator1.pitch"
  | "oscillator2.level"
  | "oscillator2.wavetablePosition"
  | "oscillator2.pitch"
  | "filter.cutoff"

interface ModulationRoute {
  id: string
  source: ModulationSource
  destination: ModulationDestination

  amount: number // -1..1
  bipolar: boolean
}
```

For the MVP, this list is **closed**.

The agent may only use these destinations.

It must not invent:

```text
oscillator.air
brightness
filter.warmth
stereo.magic
```

or any other semantic pseudo-parameter.

Higher-level concepts such as “brightness” must be translated into real supported changes.

---

# 10. Voice state

```ts
interface VoiceState {
  polyphony: number // integer 1..16
  legato: boolean

  glideSeconds: number

  velocitySensitivity: number // 0..1
}
```

Advanced voice behavior is not part of the MVP.

---

# 11. Delay

```ts
interface DelayState {
  enabled: boolean

  mode: "sync" | "free"

  division?: "1/4" | "1/8" | "1/8T" | "1/16"
  timeSeconds?: number

  feedback: number // 0..1
  mix: number // 0..1
}
```

---

# 12. Reverb

```ts
interface ReverbState {
  enabled: boolean

  mix: number // 0..1
  decaySeconds: number
  size: number // 0..1
}
```

The shared adapter maps these values into Vital reverb parameters. Browser
playback and desktop export then use Vital's reverb implementation.

---

# 13. Built-in wavetable library

The MVP needs a deliberately small, known library.

Target:

**approximately 10–15 internal wavetable IDs**

Candidate set:

```text
sine
triangle
saw
soft_square
warm_saw
hollow
airy
glass
metallic
digital
vocal
bright
```

Every `wavetableId` referenced by `PatchState` must resolve to an actual asset.

Store the library under a stable repo path, for example:

```text
src/assets/wavetables/
```

or generate the tables deterministically from source definitions.

The existing prototype already demonstrates embedding generated custom wavetable structures into `.vital` presets. fileciteturn2file0L7-L27

### OPEN QUESTION — Wavetable assets

Decide before implementing the final library:

- Should the MVP use only deterministic programmatically generated tables?
- Should some CC0 AKWF-derived material be bundled?
- Should both be supported?

Do not allow this question to block the basic synth. A handful of deterministic tables is sufficient for initial development.

---

# 14. Browser Vital renderer

The browser renderer exists for fast, faithful audition through the pinned Vital DSP.

Required:

- 2 wavetable oscillators
- polyphony
- amp envelope
- modulation envelope
- unison
- one filter
- one point-based LFO
- modulation routing
- delay
- Vital reverb

---

## 14.1 Runtime and update model

`VitalWasmRenderer` owns main-thread readiness, revisions, note state, preview
reflection, and a fixed 120 BPM audition tempo. `VitalWorkletHost` compiles the
module on the main thread, waits for the processor's `ready` event, and only then
connects the node. The processor owns the Vital engine and uses the observed
render-quantum length with preallocated buffers and no hot-path logging.

Scalar edits and previews use adapter-derived incremental control operations.
Structural changes use the exact adapter-generated Vital document through the
incremental state loader. Full state loading is reserved for filter topology, LFO
points, wavetable identity/data, and modulation topology. The runtime does not
insert an output mute around either update path.

---

# 15. Vital adapter

The exporter converts logical `PatchState` into valid `.vital` JSON.

The AI never sees this representation.

```text
PatchState
    ↓
VitalPresetAdapter
    ↓
.vital JSON
```

The adapter is responsible for:

- parameter conversion
- modulation-slot assignment
- wavetable structure
- LFO structure
- default values
- unsupported Vital state
- version metadata

The existing prototype already serializes generated patch state into `.vital` files. fileciteturn1file4L372-L383

---

# 16. Vital template and compatibility

Generation should start from a known-valid template rather than recreating every undocumented/default Vital field.

Target repo structure:

```text
fixtures/
  vital/
    init.vital
    ethereal-gate.vital
```

### Requirements

The template must:

- load successfully in Vital,
- have known provenance,
- be legally safe to redistribute,
- have its creating Vital version documented,
- contain no third-party preset content.

### OPEN QUESTION — Exact Vital compatibility target

Before committing the fixture:

1. Which installed Vital version will be the authoritative hackathon target?
2. Which version should be recorded in the exporter metadata?

Once decided, document:

```text
Validated against Vital X.Y.Z
```

and keep that target fixed for the submission.

---

# 17. Existing prototype artifacts

The existing generator should be preserved in the repository rather than re-derived.

Recommended:

```text
prototypes/
  build_presets.py
```

It demonstrates:

- known-valid template mutation
- custom Vital wavetable serialization
- custom LFO serialization
- modulation routing
- `.vital` output

Also keep at least one manually validated generated preset:

```text
fixtures/vital/ethereal-gate.vital
```

and its equivalent logical state:

```text
fixtures/patches/ethereal-gate.patch.json
```

These become regression fixtures.

---

# 18. Command layer

All mutations pass through one command layer.

```text
UI ───────────────┐
                  ↓
             applyCommand()
                  ↓
              PatchState
                  ↑
                  │
WebMCP ───────────┘
```

No UI component or tool should mutate state directly.

Each command:

1. validates input,
2. stores the previous state,
3. applies changes,
4. creates one history entry,
5. updates browser playback,
6. updates the UI,
7. returns a diff,
8. returns a compact resulting-state summary.

---

# 19. Primary WebMCP write tool

## `apply_patch`

This is the normal way for the agent to edit a sound.

### Draft tool description

> Apply one coherent sound-design change to the current patch. Use this as the default write tool for perceptual requests such as “make it darker,” “make it wider,” or “make the sound softer but keep its character.” Include all coordinated parameter changes needed for the user's single request in one call. Preserve unrelated aspects of the current patch. One call becomes one undo step. Prefer this tool over several sequential parameter edits.

Example input:

```json
{
  "reason": "Make the patch darker while preserving its airy character",
  "changes": [
    {
      "path": "filter.cutoffHz",
      "value": 4200
    },
    {
      "path": "oscillators.0.wavetablePosition",
      "value": 0.54
    }
  ]
}
```

---

# 20. Write-tool response convention

Every write must return a diff.

Example:

```json
{
  "changed": {
    "filter.cutoffHz": {
      "before": 7200,
      "after": 4200
    },
    "oscillators.0.wavetablePosition": {
      "before": 0.61,
      "after": 0.54
    }
  },
  "summary": {
    "filter": {
      "type": "lowpass",
      "cutoffHz": 4200,
      "resonance": 0.14
    },
    "oscillator1": {
      "wavetableId": "airy",
      "wavetablePosition": 0.54
    }
  },
  "canUndo": true
}
```

Never return only:

```text
OK
```

Do not return the full raw `.vital` document.

---

# 21. `get_patch`

### Draft tool description

> Read the current logical synth patch. Use this before editing when you need to understand the existing sound design. Returns the supported oscillator, envelope, filter, LFO, modulation, voice and effect state in musical units. This is the authoritative state the agent should reason from; do not infer the patch from previous conversation text.

Return a compact but complete logical patch summary.

Mark as read-only.

---

# 22. `set_lfo_shape`

### Draft tool description

> Replace or modify LFO 1's point-based shape. Use this for structural rhythmic requests such as “shorten the second pulse,” “make the gate less regular,” or “move the final pulse later.” Preserve the current LFO rate and modulation routes unless the request explicitly changes them. Points use normalized x/y coordinates from 0 to 1.

For ordinary changes involving LFO plus other parameters, use `apply_patch` instead.

---

# 23. Other WebMCP tools

## Read tools

### `get_patch`

Current patch state.

### `get_session_state`

Returns:

```ts
{
  currentVariant: "A" | "B"
  hasVariantB: boolean
  canUndo: boolean
  canRedo: boolean
}
```

### `list_presets`

Returns available curated presets.

### `analyze_patch`

Optional lightweight acoustic analysis.

All pure reads must use the appropriate read-only hint.

---

## Write tools

### `create_patch`

Creates an initial patch from a structured patch proposal.

### `load_preset`

Loads one curated preset.

### `apply_patch`

Default editing operation.

### `set_lfo_shape`

Specialized LFO operation.

### `create_variant`

Creates B from the current patch and applies requested edits.

### `select_variant`

Selects A or B as current.

### `undo`

Reverts one semantic transaction.

### `redo`

Reapplies it.

---

# 24. AI generation protocol

The AI should not generate raw `.vital` JSON.

It should first translate language into a sound-design plan.

Example:

> “Ethereal gated trance pad.”

Interpretation:

```text
class:
  pad

tone:
  airy
  bright
  soft

width:
  wide

envelope:
  moderate attack
  long release

rhythm:
  synchronized amplitude gating

movement:
  slow timbral evolution

space:
  significant reverb
  moderate delay
```

Then translate that plan into `PatchState`.

---

# 25. Artist-reference prompts

Users may use culturally familiar references:

> “A pad that could fit in a Weeknd-style production.”

The agent should convert this into general sound-design characteristics such as:

- dark
- lush
- wide
- retro
- glossy
- dreamy

rather than attempting to reproduce a specific recording.

---

# 26. A/B state

The MVP supports exactly:

```text
A
B
```

No branching tree.

Internal state may look conceptually like:

```ts
interface SessionState {
  variants: {
    A: PatchState
    B?: PatchState
  }

  currentVariant: "A" | "B"
}
```

`create_variant`:

1. clones the current state,
2. applies one requested transformation,
3. stores the result as the alternate version.

The agent must always be able to read which variant is current.

---

# 27. Undo and redo

Each `apply_patch` call creates exactly one history item.

Therefore:

> “Undo that.”

reverts the entire semantic change.

It must not revert only one of several coordinated parameter edits.

MVP:

- undo required
- redo desirable

---

# 28. Lightweight analysis

Analysis is for **directional validation**, not judging musical quality.

Initial implementation:

- RMS
- spectral centroid

Possible later addition:

- rough attack estimate

Example:

```text
Intent:
make darker

before:
centroid = 3.1 kHz

after:
centroid = 2.4 kHz

direction:
confirmed
```

The user's ears remain the authoritative perceptual judgement.

Analysis is not allowed to override:

> “I liked the previous one better.”

---

# 29. Latency requirement

Measure:

```text
user submits instruction
        ↓
first patch mutation occurs
```

This is more important than time until the assistant has finished writing its explanation.

Desired interaction:

```text
User:
“Make it darker.”

short delay

SOUND CHANGES

Assistant:
“Lowered the filter and pulled the bright wavetable layer back slightly.”
```

Avoid long prose before tool execution.

`apply_patch` exists partly to avoid multiple sequential model/tool round trips.

---

# 30. Curated presets

Hackathon target:

**6–12 good presets**

Possible initial set:

### Pads
- Ethereal Gate
- Midnight Pad

### Bass
- Warm Mono Bass
- Digital Bass

### Plucks
- Glass Pluck
- Soft Pluck

### Leads
- Wide Lead
- Retro Lead

### Other
- Dreamy Keys
- Atmosphere
- Rhythmic Pulse
- Digital Texture

These may be:

1. initially generated by the system,
2. auditioned manually,
3. adjusted,
4. committed as curated fixtures.

The application must not depend on having a large preset dataset.

---

# 31. UI

The UI should prioritize clarity over recreating a hardware/software synth skin.

## Main areas

### Conversation

Prompt and AI responses.

### Oscillators

Show:

- wavetable
- position
- level
- pitch
- unison

### Envelopes

Show amp and modulation envelopes.

### Filter

Show:

- type
- cutoff
- resonance

### LFO

Display point-based LFO graph.

It does not need to be mouse-editable for the MVP.

### Modulation

Simple view of active routes.

### Effects

Delay and reverb.

### Audition

- keyboard or hold-note button
- octave
- volume

### Session

- A / B
- undo
- redo if available

### Export

Prominent:

**Export `.vital`**

---

# 32. Recommended repo structure

```text
wavetable-workbench/
│
├── src/
│   ├── patch/
│   │   ├── types.ts
│   │   ├── defaults.ts
│   │   ├── validation.ts
│   │   └── paths.ts
│   │
│   ├── commands/
│   │   ├── applyCommand.ts
│   │   ├── history.ts
│   │   └── diff.ts
│   │
│   ├── audio/
│   │   ├── SynthRenderer.ts
│   │   ├── preview.ts
│   │   ├── reflection.ts
│   │   ├── tempo.ts
│   │   ├── lfo.ts
│   │   ├── units.ts
│   │   └── vital/
│   │       ├── VitalWasmRenderer.ts
│   │       ├── VitalWorkletHost.ts
│   │       ├── vitalProcessor.ts
│   │       └── VitalEngine.ts
│   │
│   ├── vital/
│   │   ├── exportVital.ts
│   │   ├── parameterMap.ts
│   │   ├── wavetable.ts
│   │   └── lfo.ts
│   │
│   ├── webmcp/
│   │   ├── registerTools.ts
│   │   ├── applyPatch.ts
│   │   ├── getPatch.ts
│   │   ├── setLfoShape.ts
│   │   └── sessionTools.ts
│   │
│   ├── presets/
│   │   ├── index.ts
│   │   └── presets/
│   │
│   ├── analysis/
│   │   ├── rms.ts
│   │   └── centroid.ts
│   │
│   ├── assets/
│   │   └── wavetables/
│   │
│   └── ui/
│
├── prototypes/
│   └── build_presets.py
│
├── fixtures/
│   ├── vital/
│   │   ├── init.vital
│   │   └── ethereal-gate.vital
│   │
│   └── patches/
│       └── ethereal-gate.patch.json
│
├── tests/
│   ├── vital/
│   ├── patch/
│   └── commands/
│
└── README.md
```

Exact framework-specific UI folders can vary.

The architectural boundaries should not.

---

# 33. Stack and environment

These choices have **not yet been fully settled**.

### OPEN QUESTION — Frontend stack

Choose one before implementation starts.

Likely options:

- React + TypeScript + Vite
- vanilla TypeScript + Vite

Decision criteria:

- fastest implementation
- reliable Web Audio integration
- simple state updates
- easy deployment

Do not introduce a large framework solely for architecture.

---

### OPEN QUESTION — Deployment

Choose one:

- Vercel
- Netlify
- other static hosting known to work correctly with the WebMCP browser environment

The project should remain largely client-side.

### Licensing and distribution

The combined application is distributed under `GPL-3.0-or-later`. The production
bundle includes a modified build of Vital from pinned commit
`636ca0ef517a4db087a6a08a6a8a5e704e21f836`, plus `LICENSE`, `NOTICE`, and the
Vital Init fixture. `NOTICE` and `wasm/vital/UPSTREAM.json` identify every
incorporated source area and local patch. The repository, pinned fetch script,
patches, and build scripts are the corresponding source distribution.

---

# 34. WebMCP prerequisites

Before feature development, establish and document:

- which ChatGPT client/browser environment is used for testing,
- which model/configuration is used,
- whether any browser flag is required,
- whether the deployed origin requires HTTPS,
- any workspace/account limitations encountered.

Do not rely on remembered platform assumptions.

Record the actual working setup in:

```text
README.md
```

under:

```text
Development / WebMCP prerequisites
```

### Fallback

If the preferred ChatGPT WebMCP environment fails but WebMCP can be exercised through an alternative supported browser/development path, document that path immediately.

If WebMCP cannot be made operational at all, treat this as a challenge-entry blocker rather than silently converting the product into an ordinary chat application.

---

# 35. Golden fixtures and regression tests

Keep known-good fixtures.

Minimum:

```text
fixtures/vital/init.vital
fixtures/vital/ethereal-gate.vital
fixtures/patches/ethereal-gate.patch.json
```

Tests should verify structural behavior such as:

```text
PatchState
   ↓
Vital exporter
   ↓
contains expected oscillator state
contains expected wavetable keyframes
contains expected LFO points
contains expected modulation routes
```

Also test:

```text
apply_patch
   ↓
produces correct state
produces correct diff
creates one history entry
```

These tests do not replace manual Vital validation.

---

# 36. Vital manual validation matrix

For representative patches:

```text
browser
  ↓
export
  ↓
Vital
  ↓
play / inspect
```

At minimum test:

- pad
- bass
- pluck
- lead
- rhythmic gated patch

Check:

- pitch
- oscillator balance
- envelopes
- LFO shape
- LFO rate
- modulation
- filter direction
- delay
- reverb
- custom wavetable content

---

# 37. MVP must-have

- WebMCP working
- canonical `PatchState`
- command layer
- two oscillators
- amp envelope
- modulation envelope
- unison
- polyphony
- one filter
- one point-based LFO
- supported modulation routes
- delay
- Vital reverb
- playable browser preview
- natural-language initial generation
- `apply_patch`
- diff + resulting summary on every write
- persistent state
- custom LFO editing
- undo
- A/B
- `.vital` exporter
- real Vital validation
- deployed application

---

# 38. Strongly desired

- 6–12 curated presets
- visual LFO graph
- RMS analysis
- spectral centroid
- visible changed-parameter highlighting
- redo
- manual control for major synth parameters

---

# 39. Cut first

If behind:

1. acoustic analysis
2. redo
3. extra curated presets beyond approximately 6
4. manual modulation routing UI
5. computer keyboard input
6. advanced envelope curves
7. delay stereo complexity
8. parameter-change animation
9. optional wavetable browsing features

---

# 40. Never cut

- persistent patch state
- command layer
- `apply_patch`
- browser audition
- conversational editing
- point-based LFO editing
- undo
- Vital export
- actual Vital validation
- WebMCP
- session testing
- demo video

These constitute the product argument.

---

# 41. Explicit non-goals

## No Vital user interface or desktop host

The app embeds only Vital's headless synthesis/state layer. It does not port
Vital's editor, OpenGL interface, preset browser, plugin host, standalone shell,
desktop file services, or account services.

## No large preset dataset requirement

Initial generation is allowed to start from scratch.

## No complex history graph

A/B + undo is enough.

## No full wavetable editor

Wavetables support the synth but are not the MVP's central editing workflow.

## No sample import

Future feature only.

---

# 42. Future — sample to preset

Potential future flow:

```text
drop sample
    ↓
analyze pitch / envelope / timbre
    ↓
extract or construct wavetable
    ↓
build initial synth patch
    ↓
conversational refinement
    ↓
export
```

The previous Wavetable Workbench design explored pitch detection, cycle extraction and harmonic wavetable construction; that work remains useful future context but is explicitly outside this submission. fileciteturn1file2L183-L193

---

# 43. Future — better starting material

Possible later features:

- ~30 curated presets
- semantic preset retrieval
- larger CC0 wavetable libraries
- AI chooses whether to generate or retrieve
- user-imported Vital presets
- conversational editing of imported patches

---

# 44. Future — richer analysis

Possible additions:

- attack estimation
- stereo width
- spectral motion
- audio embeddings
- reference-sound comparison
- harmonic descriptors

These should only be added if they improve actual editing behavior.

---

# 45. Hackathon roadmap

## Day 1 — Thursday 27 August

### Objective: prove the architecture

Do not spend Day 1 building the UI.

### 1. Preserve the prototype

Move the existing generator into:

```text
prototypes/build_presets.py
```

Commit one known-good generated `.vital`.

---

### 2. Decide the remaining foundational questions

Resolve:

- frontend stack
- deployment target
- browser oscillator implementation for the first prototype
- Vital compatibility version
- legal/provenance-safe Init template

Record the decisions.

Do not leave them implicit.

---

### 3. Create `PatchState`

Implement:

```text
src/patch/types.ts
src/patch/defaults.ts
src/patch/validation.ts
```

This should happen before building adapters.

---

### 4. Implement command skeleton

Implement:

```text
applyCommand()
history
diff generation
undo
```

---

### 5. Vital exporter proof

Implement enough mapping for:

- oscillator
- envelope
- LFO
- modulation

Export one patch.

Load it into the pinned Vital version.

---

### 6. Custom LFO confirmation

The prototype already demonstrates the serialization structure, so this is **confirmation rather than discovery**.

Open the generated Ethereal Gate preset.

Confirm:

- the custom points appear correctly,
- the rhythm gates correctly,
- changing one known point changes the expected section.

Once confirmed, record this as a golden fixture and stop re-proving it.

---

### 7. WebMCP smoke test

Implement:

```text
get_patch
apply_patch
```

Prove:

```text
agent
 ↓
WebMCP
 ↓
PatchState changes
```

---

### 8. Measure latency

Record:

```text
instruction submitted
→ apply_patch executes
```

This becomes the baseline.

### End-of-day target

```text
Agent → WebMCP → PatchState → .vital → Vital
```

works end to end through the shared Vital state boundary.

---

# Day 2 — Friday 28 August

## Objective: make the patch playable

Implement only the core audio path.

### Oscillator 1

- wavetable
- level
- pitch

### Amp envelope

- ADSR/hold

### Polyphony

### Audition control

- hold note and/or simple keyboard

### Oscillator 2

### Unison

By the end of Day 2:

> A pad patch should be playable and recognizably synth-like in the browser.

**Do not implement the filter merely because there is time left in the original estimate.**

Get the oscillator/envelope architecture stable first.

---

# Day 3 — Saturday 29 August

## Objective: make the synth expressive

Implement:

### Filter

- LP
- HP
- BP
- cutoff
- resonance

### Mod envelope

### Point-based LFO

- interpolation
- sync
- free rate
- phase

### Modulation routing

At minimum:

```text
LFO → oscillator level
LFO → wavetable position
LFO → filter cutoff

mod envelope → filter cutoff
mod envelope → wavetable position
```

### LFO visualization

Read-only graph is enough.

### Delay

### Vital reverb

End-of-day proof:

> Change the second pulse of the LFO in `PatchState`.

The browser rhythm changes.

Export.

Vital reflects the same structural edit.

---

# Day 4 — Sunday 30 August

## Objective: make the agent a sound designer

Implement/finalize WebMCP:

### `get_patch`

### `get_session_state`

### `create_patch`

### `load_preset`

### `apply_patch`

### `set_lfo_shape`

### `undo`

Every write returns:

```text
diff
+
resulting summary
```

Test real instructions:

> “Make it darker.”

> “Make it wider.”

> “Make the attack softer.”

> “Make the gate less regular.”

> “Shorten the second pulse.”

Inspect whether the agent:

- preserves unrelated state,
- prefers `apply_patch`,
- batches coordinated changes,
- avoids invented parameter paths.

---

# Day 5 — Monday 31 August

## Objective: complete the end-to-end product

### A/B

Implement:

- create B
- switch A/B
- select result

### Export UI

### Vital adapter hardening

Test:

- pad
- bass
- pluck
- lead
- rhythmic patch

### Curated presets

Generate/select approximately:

**6–10 strong starting patches**

Do not chase 30.

### If ahead

Implement:

- RMS
- spectral centroid

No larger analysis project.

---

# Day 6 — Tuesday 1 September

## Objective: test conversations, not features

No major feature work planned.

Run at least **20 real sessions**.

Example instructions:

> “Make me a warm dreamy pad.”

> “Too dark.”

> “Keep that tone but make the attack slower.”

> “More movement.”

> “Make the movement subtler.”

> “Shorten the second gate.”

> “Make the last pulse arrive later.”

> “Give me a wider alternative.”

> “Undo that.”

Watch for:

- wrong tool selection
- repeated granular calls instead of `apply_patch`
- excessive parameter changes
- state drift
- invented paths
- bad argument values
- A/B confusion
- undo problems
- latency
- descriptions causing poor agent behavior

Fix primarily:

- tool descriptions
- schemas
- validation
- result summaries
- system instructions

This day is protected.

---

# Day 7 — Wednesday 2 September

## Objective: demo and submission

Feature freeze.

Record the reference demo:

### 1.

> “Create an ethereal gated trance pad.”

Play.

### 2.

> “Make it darker without losing the airy character.”

Play.

### 3.

> “Make the gate less regular and shorten the second pulse.”

Show the LFO changing.

Play.

### 4.

> “Give me a wider alternative.”

A/B.

Choose one.

### 5.

Export `.vital`.

Open it in Vital.

Play.

The video demonstrates:

- generation
- persistent state
- perceptual editing
- structured rhythmic editing
- agent tool use
- human feedback
- A/B
- interoperability

---

# Day 8 — Thursday 3 September

## Submission buffer

No planned feature work.

Perform:

- deployment smoke test
- WebMCP smoke test
- preset generation smoke test
- `.vital` export smoke test
- Vital load test
- video upload check
- README review
- licence/provenance check
- Devpost review
- submit early

---

# 46. Daily kill rule

At the end of every development day ask:

> Does this directly improve the reference demo?

```text
generate
   ↓
listen
   ↓
darker
   ↓
edit gate
   ↓
A/B wider
   ↓
export
```

If not, and that path is not already stable, cut the feature.

---

# 47. Remaining open questions

These should be resolved explicitly rather than silently guessed by a coding agent.

## Q1. Frontend stack

React + TypeScript + Vite, or vanilla TypeScript + Vite?

---

## Q2. Deployment target

Vercel, Netlify, or another static host?

---

## Q3. Browser oscillator implementation — resolved

Use the pinned Vital DSP compiled to WebAssembly inside an `AudioWorklet`; do not
maintain a separate `PeriodicWave` renderer.

---

## Q4. Vital compatibility target

Which exact installed Vital version will define successful export for the submission?

---

## Q5. Vital Init fixture

What legally safe known-valid Init preset should become:

```text
fixtures/vital/init.vital
```

and what is its provenance?

---

## Q6. Built-in wavetable source

For the initial 10–15 tables:

- generated internally,
- CC0 material,
- or a mixture?

Do not expand this into a dataset project before the core loop works.

---

## Q7. WebMCP development environment

Which exact client/browser/account configuration is confirmed working for this project?

Document the confirmed setup on Day 1.

---

# 48. Definition of success

Wavetable Workbench succeeds if a musician can:

1. describe a sound without knowing synth programming,
2. immediately receive a usable starting patch,
3. listen,
4. describe what is wrong in perceptual language,
5. hear the existing sound change coherently,
6. direct a structural change such as modifying one part of an LFO rhythm,
7. compare an alternative,
8. undo unwanted edits,
9. export the final patch,
10. open it in Vital and continue working.

The initial generation does not need to rival a professional sound designer.

The essential criterion is:

> **Does conversation reliably move the current sound toward what the user wants?**

Everything in the submission should serve that loop.
