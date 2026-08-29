#include <algorithm>
#include <cmath>
#include <new>

#include <emscripten/emscripten.h>

#include "load_save.h"
#include "sound_engine.h"
#include "synth_base.h"

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
  float sample_rate_;
  double current_time_;
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
