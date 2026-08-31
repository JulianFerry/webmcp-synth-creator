#include <algorithm>
#include <cmath>
#include <new>

#include <emscripten/emscripten.h>

#include "load_save.h"
#include "sound_engine.h"
#include "synth_base.h"
#include "wave_frame.h"
#include "wavetable.h"
#include "wavetable_creator.h"
#include "wavetable_group.h"

class VitalSynth final : public HeadlessSynth {
 public:
  explicit VitalSynth(float sample_rate) : sample_rate_(sample_rate), current_time_(0.0) {
    initEngine();
    getEngine()->setSampleRate(static_cast<int>(sample_rate));
    getEngine()->setBpm(120.0f);
    getEngine()->checkOversampling();
    getEngine()->updateAllModulationSwitches();
  }

  bool loadState(const char* state_json, int length) {
    if (state_json == nullptr || length <= 0)
      return false;

    const json state = json::parse(state_json, state_json + length);
    const bool loaded = loadFromJson(state);
    if (loaded) {
      processModulationChanges();
      getEngine()->updateAllModulationSwitches();
    }
    return loaded;
  }

  // Incremental variant of loadState. Vital renders one WaveFrame per wavetable frame position
  // while loading, and a wavetable whose keyframes span position 0..256 therefore costs ~257 FFT
  // frame renders. That is two orders of magnitude over an audio callback budget, so the render
  // loop is driven from the caller instead: beginLoadState applies everything else, stepLoadState
  // renders a bounded number of frames per call, and finishLoadState completes the wavetables.
  //
  // The engine must not be processed between begin and finish: controls are already the new
  // state's while the wavetables are still partially rendered.
  bool beginLoadState(const char* state_json, int length) {
    abortLoadState();
    if (state_json == nullptr || length <= 0)
      return false;

    json state = json::parse(state_json, state_json + length);
    if (state.count("settings") == 0 || state["settings"].count("wavetables") == 0)
      return false;

    // Hand Vital the exact document minus the wavetable array so LoadSave::loadWavetables becomes
    // a no-op; the wavetables are applied below from the untouched original.
    pending_wavetables_ = state["settings"]["wavetables"];
    json without_wavetables = state;
    without_wavetables["settings"]["wavetables"] = json::array();
    if (!loadFromJson(without_wavetables))
      return false;

    // Mirrors WavetableCreator::render() at mtytel/vital@636ca0e
    // (src/common/wavetable/wavetable_creator.cpp:93) using only its public interface. Keep in
    // sync when the pinned upstream commit changes.
    load_total_frames_ = 0;
    for (int index = 0; index < static_cast<int>(pending_wavetables_.size()); ++index) {
      WavetableCreator* creator = index < kMaxWavetables ? getWavetableCreator(index) : nullptr;
      if (creator == nullptr)
        break;

      // Patch 0005 makes the render at the tail of jsonToState optional; it is the loop this
      // whole mechanism exists to spread out, and calling it here would do all the work twice.
      creator->jsonToState(pending_wavetables_[index], false);

      int last_waveframe = 0;
      bool shepard = creator->numGroups() > 0;
      for (int group = 0; group < creator->numGroups(); ++group) {
        creator->getGroup(group)->prerender();
        last_waveframe = std::max(last_waveframe, creator->getGroup(group)->getLastKeyframePosition());
        shepard = shepard && creator->getGroup(group)->isShepardTone();
      }

      creator->getWavetable()->setNumFrames(last_waveframe + 1);
      creator->getWavetable()->setShepardTable(shepard);
      load_last_frame_[load_creator_count_] = last_waveframe;
      load_max_span_[load_creator_count_] = 0.0f;
      load_total_frames_ += last_waveframe + 1;
      load_creator_count_ += 1;
    }

    load_active_ = true;
    load_creator_ = 0;
    load_frame_ = 0;
    return true;
  }

  // Renders up to max_frames wavetable frames. Returns frames still outstanding, or -1 if no
  // incremental load is in progress.
  int stepLoadState(int max_frames) {
    if (!load_active_)
      return -1;

    for (int rendered = 0; rendered < max_frames && load_creator_ < load_creator_count_; ++rendered) {
      WavetableCreator* creator = getWavetableCreator(load_creator_);
      load_max_span_[load_creator_] = std::max(load_max_span_[load_creator_], creator->render(load_frame_));
      load_completed_frames_ += 1;
      load_frame_ += 1;

      if (load_frame_ > load_last_frame_[load_creator_]) {
        finishCreator(creator, load_creator_);
        load_creator_ += 1;
        load_frame_ = 0;
      }
    }

    return load_total_frames_ - load_completed_frames_;
  }

  bool finishLoadState() {
    if (!load_active_)
      return false;

    while (load_creator_ < load_creator_count_)
      stepLoadState(load_total_frames_);

    processModulationChanges();
    getEngine()->updateAllModulationSwitches();
    abortLoadState();
    return true;
  }

  void abortLoadState() {
    load_active_ = false;
    load_creator_ = 0;
    load_creator_count_ = 0;
    load_frame_ = 0;
    load_total_frames_ = 0;
    load_completed_frames_ = 0;
    pending_wavetables_ = json::array();
  }

  void process(float* left, float* right, int frames) {
    vital::SoundEngine* engine = getEngine();
    int rendered = 0;
    while (rendered < frames) {
      const int block_size = std::min(frames - rendered, vital::kMaxBufferSize);
      engine->correctToTime(current_time_);
      engine->process(block_size);
      const vital::poly_float* output = engine->output(0)->buffer;

      for (int frame = 0; frame < block_size; ++frame) {
        left[rendered + frame] = output[frame][0];
        right[rendered + frame] = output[frame][1];
      }

      current_time_ += block_size / static_cast<double>(sample_rate_);
      rendered += block_size;
    }
  }

 private:
  static constexpr int kMaxWavetables = vital::kNumOscillators;

  void finishCreator(WavetableCreator* creator, int index) {
    // Upstream ends its render loop by copying two values out of its protected compute_frame_.
    // Only an audio-file component ever writes them, and it writes them on every render, so
    // rendering the final position through the same groups reproduces the same result.
    load_frame_scratch_.clear();
    for (int group = 0; group < creator->numGroups(); ++group)
      creator->getGroup(group)->render(&load_frame_scratch_, static_cast<float>(load_last_frame_[index]));

    creator->getWavetable()->setFrequencyRatio(load_frame_scratch_.frequency_ratio);
    creator->getWavetable()->setSampleRate(load_frame_scratch_.sample_rate);
    creator->postRender(load_max_span_[index]);
  }

  float sample_rate_;
  double current_time_;

  bool load_active_ = false;
  int load_creator_ = 0;
  int load_creator_count_ = 0;
  int load_frame_ = 0;
  int load_total_frames_ = 0;
  int load_completed_frames_ = 0;
  int load_last_frame_[kMaxWavetables] = {};
  float load_max_span_[kMaxWavetables] = {};
  vital::WaveFrame load_frame_scratch_;
  json pending_wavetables_ = json::array();
};

extern "C" {

EMSCRIPTEN_KEEPALIVE VitalSynth* vital_create(float sample_rate) {
  if (!std::isfinite(sample_rate) || sample_rate <= 0.0f)
    return nullptr;

  try {
    return new VitalSynth(sample_rate);
  }
  catch (...) {
    return nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE void vital_destroy(VitalSynth* synth) {
  delete synth;
}

EMSCRIPTEN_KEEPALIVE bool vital_load_state(VitalSynth* synth, const char* json, int length) {
  if (synth == nullptr)
    return false;

  try {
    return synth->loadState(json, length);
  }
  catch (...) {
    return false;
  }
}

EMSCRIPTEN_KEEPALIVE bool vital_begin_load_state(VitalSynth* synth, const char* json, int length) {
  if (synth == nullptr)
    return false;

  try {
    return synth->beginLoadState(json, length);
  }
  catch (...) {
    synth->abortLoadState();
    return false;
  }
}

EMSCRIPTEN_KEEPALIVE int vital_step_load_state(VitalSynth* synth, int max_frames) {
  if (synth == nullptr || max_frames <= 0)
    return -1;

  try {
    return synth->stepLoadState(max_frames);
  }
  catch (...) {
    synth->abortLoadState();
    return -1;
  }
}

EMSCRIPTEN_KEEPALIVE bool vital_finish_load_state(VitalSynth* synth) {
  if (synth == nullptr)
    return false;

  try {
    return synth->finishLoadState();
  }
  catch (...) {
    synth->abortLoadState();
    return false;
  }
}

EMSCRIPTEN_KEEPALIVE void vital_set_bpm(VitalSynth* synth, float bpm) {
  if (synth != nullptr && std::isfinite(bpm) && bpm > 0.0f)
    synth->getEngine()->setBpm(bpm);
}

EMSCRIPTEN_KEEPALIVE void vital_note_on(VitalSynth* synth, int note, float velocity) {
  if (synth != nullptr)
    synth->getEngine()->noteOn(note, velocity, 0, 0);
}

EMSCRIPTEN_KEEPALIVE void vital_note_off(VitalSynth* synth, int note) {
  if (synth != nullptr)
    synth->getEngine()->noteOff(note, 0.5f, 0, 0);
}

EMSCRIPTEN_KEEPALIVE void vital_all_notes_off(VitalSynth* synth) {
  if (synth != nullptr)
    synth->getEngine()->allNotesOff(0);
}

EMSCRIPTEN_KEEPALIVE void vital_process(VitalSynth* synth, float* left, float* right, int frames) {
  if (synth == nullptr || left == nullptr || right == nullptr || frames <= 0)
    return;

  synth->process(left, right, frames);
}

}
