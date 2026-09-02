#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

class VitalSynth;

extern "C" {
VitalSynth* vital_create(float sample_rate);
void vital_destroy(VitalSynth* synth);
bool vital_load_state(VitalSynth* synth, const char* json, int length);
void vital_set_bpm(VitalSynth* synth, float bpm);
void vital_note_on(VitalSynth* synth, int note, float velocity);
void vital_note_off(VitalSynth* synth, int note);
void vital_process(VitalSynth* synth, float* left, float* right, int frames);
}

namespace {

struct Options {
  std::string output_path;
  std::string report_path;
  std::string state_path;
  int sample_rate = 48000;
  int block_frames = 128;
  int note = 60;
  float velocity = 100.0f / 127.0f;
  float bpm = 120.0f;
  double hold_seconds = 2.0;
  double tail_seconds = 3.0;
};

bool readValue(int argc, const char* argv[], int* index, std::string* value) {
  if (*index + 1 >= argc)
    return false;
  *value = argv[++(*index)];
  return true;
}

bool parseInt(const std::string& value, int* output) {
  try {
    std::size_t consumed = 0;
    const int parsed = std::stoi(value, &consumed);
    if (consumed != value.size())
      return false;
    *output = parsed;
    return true;
  }
  catch (...) {
    return false;
  }
}

bool parseFloat(const std::string& value, float* output) {
  try {
    std::size_t consumed = 0;
    const float parsed = std::stof(value, &consumed);
    if (consumed != value.size() || !std::isfinite(parsed))
      return false;
    *output = parsed;
    return true;
  }
  catch (...) {
    return false;
  }
}

bool parseDouble(const std::string& value, double* output) {
  try {
    std::size_t consumed = 0;
    const double parsed = std::stod(value, &consumed);
    if (consumed != value.size() || !std::isfinite(parsed))
      return false;
    *output = parsed;
    return true;
  }
  catch (...) {
    return false;
  }
}

bool parseOptions(int argc, const char* argv[], Options* options) {
  for (int index = 1; index < argc; ++index) {
    const std::string argument = argv[index];
    std::string value;
    if (!readValue(argc, argv, &index, &value))
      return false;

    if (argument == "--state")
      options->state_path = value;
    else if (argument == "--output")
      options->output_path = value;
    else if (argument == "--report")
      options->report_path = value;
    else if (argument == "--sample-rate") {
      if (!parseInt(value, &options->sample_rate))
        return false;
    }
    else if (argument == "--block-frames") {
      if (!parseInt(value, &options->block_frames))
        return false;
    }
    else if (argument == "--note") {
      if (!parseInt(value, &options->note))
        return false;
    }
    else if (argument == "--velocity") {
      if (!parseFloat(value, &options->velocity))
        return false;
    }
    else if (argument == "--bpm") {
      if (!parseFloat(value, &options->bpm))
        return false;
    }
    else if (argument == "--hold-seconds") {
      if (!parseDouble(value, &options->hold_seconds))
        return false;
    }
    else if (argument == "--tail-seconds") {
      if (!parseDouble(value, &options->tail_seconds))
        return false;
    }
    else {
      return false;
    }
  }

  return !options->state_path.empty() && !options->output_path.empty() &&
         options->sample_rate > 0 && options->block_frames > 0 &&
         options->note >= 0 && options->note <= 127 && options->velocity >= 0.0f &&
         options->velocity <= 1.0f && options->bpm > 0.0f &&
         options->hold_seconds > 0.0 && options->tail_seconds > 0.0;
}

bool readFile(const std::string& path, std::string* contents) {
  std::ifstream input(path, std::ios::binary);
  if (!input)
    return false;
  contents->assign(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
  return input.good() || input.eof();
}

bool writeSamples(const std::string& path, const std::vector<float>& interleaved) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output)
    return false;
  output.write(reinterpret_cast<const char*>(interleaved.data()),
               static_cast<std::streamsize>(interleaved.size() * sizeof(float)));
  return output.good();
}

bool writeReport(const std::string& path, const Options& options, int total_frames,
                 double create_ms, double state_load_ms, double render_ms,
                 int non_finite_samples, float peak) {
  if (path.empty())
    return true;
  std::ofstream output(path, std::ios::trunc);
  if (!output)
    return false;
  output.precision(9);
  output << "{\n"
         << "  \"sampleRate\": " << options.sample_rate << ",\n"
         << "  \"blockFrames\": " << options.block_frames << ",\n"
         << "  \"note\": " << options.note << ",\n"
         << "  \"velocity\": " << options.velocity << ",\n"
         << "  \"bpm\": " << options.bpm << ",\n"
         << "  \"holdSeconds\": " << options.hold_seconds << ",\n"
         << "  \"tailSeconds\": " << options.tail_seconds << ",\n"
         << "  \"totalFrames\": " << total_frames << ",\n"
         << "  \"createMs\": " << create_ms << ",\n"
         << "  \"stateLoadMs\": " << state_load_ms << ",\n"
         << "  \"renderMs\": " << render_ms << ",\n"
         << "  \"nonFiniteSamples\": " << non_finite_samples << ",\n"
         << "  \"peak\": " << peak << "\n"
         << "}\n";
  return output.good();
}

double elapsedMilliseconds(std::chrono::steady_clock::time_point started_at) {
  return std::chrono::duration<double, std::milli>(
             std::chrono::steady_clock::now() - started_at)
      .count();
}

}  // namespace

int main(int argc, const char* argv[]) {
  Options options;
  if (!parseOptions(argc, argv, &options)) {
    std::cerr << "Usage: vital-native-render --state FILE --output FILE [--report FILE] "
                 "[--sample-rate HZ] [--block-frames FRAMES] [--note MIDI] "
                 "[--velocity 0..1] [--bpm BPM] [--hold-seconds S] [--tail-seconds S]\n";
    return 2;
  }

  std::string state_json;
  if (!readFile(options.state_path, &state_json) || state_json.empty() ||
      state_json.size() > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
    std::cerr << "Unable to read Vital state: " << options.state_path << "\n";
    return 3;
  }

  const auto create_started_at = std::chrono::steady_clock::now();
  VitalSynth* synth = vital_create(static_cast<float>(options.sample_rate));
  const double create_ms = elapsedMilliseconds(create_started_at);
  if (synth == nullptr) {
    std::cerr << "Vital engine construction failed\n";
    return 4;
  }

  const auto load_started_at = std::chrono::steady_clock::now();
  const bool loaded = vital_load_state(synth, state_json.data(), static_cast<int>(state_json.size()));
  const double state_load_ms = elapsedMilliseconds(load_started_at);
  if (!loaded) {
    vital_destroy(synth);
    std::cerr << "Vital rejected the supplied state\n";
    return 5;
  }

  vital_set_bpm(synth, options.bpm);
  vital_note_on(synth, options.note, options.velocity);

  const int hold_frames = static_cast<int>(std::llround(options.hold_seconds * options.sample_rate));
  const int total_frames = hold_frames +
                           static_cast<int>(std::llround(options.tail_seconds * options.sample_rate));
  std::vector<float> interleaved(static_cast<std::size_t>(total_frames) * 2);
  std::vector<float> left(options.block_frames);
  std::vector<float> right(options.block_frames);
  int non_finite_samples = 0;
  float peak = 0.0f;

  const auto render_started_at = std::chrono::steady_clock::now();
  for (int offset = 0; offset < total_frames;) {
    if (offset == hold_frames)
      vital_note_off(synth, options.note);
    const int frames_until_event = offset < hold_frames ? hold_frames - offset : total_frames - offset;
    const int frames = std::min({options.block_frames, total_frames - offset, frames_until_event});
    vital_process(synth, left.data(), right.data(), frames);

    for (int frame = 0; frame < frames; ++frame) {
      const float left_sample = left[frame];
      const float right_sample = right[frame];
      if (!std::isfinite(left_sample))
        non_finite_samples += 1;
      if (!std::isfinite(right_sample))
        non_finite_samples += 1;
      if (std::isfinite(left_sample))
        peak = std::max(peak, std::abs(left_sample));
      if (std::isfinite(right_sample))
        peak = std::max(peak, std::abs(right_sample));
      interleaved[static_cast<std::size_t>(offset + frame) * 2] = left_sample;
      interleaved[static_cast<std::size_t>(offset + frame) * 2 + 1] = right_sample;
    }
    offset += frames;
  }
  const double render_ms = elapsedMilliseconds(render_started_at);
  vital_destroy(synth);

  if (!writeSamples(options.output_path, interleaved)) {
    std::cerr << "Unable to write native samples: " << options.output_path << "\n";
    return 6;
  }
  if (!writeReport(options.report_path, options, total_frames, create_ms, state_load_ms,
                   render_ms, non_finite_samples, peak)) {
    std::cerr << "Unable to write native report: " << options.report_path << "\n";
    return 7;
  }
  if (non_finite_samples != 0) {
    std::cerr << "Native render produced non-finite samples\n";
    return 8;
  }
  return 0;
}
