cmake_minimum_required(VERSION 3.22)

project(vital_wasm LANGUAGES CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this target through emcmake")
endif()

set(VITAL_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../vendor/vital" CACHE PATH "Pinned Vital source checkout")

if(NOT EXISTS "${VITAL_SOURCE_DIR}/src/common/synth_base.cpp")
  message(FATAL_ERROR "Vital source is unavailable at ${VITAL_SOURCE_DIR}; run fetch-source.sh")
endif()

set(VITAL_JUCE_LIBRARY_DIR "${VITAL_SOURCE_DIR}/headless/JuceLibraryCode")
set(VITAL_JUCE_MODULE_DIR "${VITAL_SOURCE_DIR}/third_party/JUCE/modules")

add_executable(vital
  bridge.cpp
  "${VITAL_SOURCE_DIR}/src/unity_build/common.cpp"
  "${VITAL_SOURCE_DIR}/src/unity_build/synthesis.cpp"
  "${VITAL_JUCE_LIBRARY_DIR}/include_juce_audio_basics.cpp"
  "${VITAL_JUCE_LIBRARY_DIR}/include_juce_audio_formats.cpp"
  "${VITAL_JUCE_LIBRARY_DIR}/include_juce_core.cpp"
  "${VITAL_JUCE_LIBRARY_DIR}/include_juce_data_structures.cpp"
  "${VITAL_JUCE_LIBRARY_DIR}/include_juce_dsp.cpp"
  "${VITAL_JUCE_LIBRARY_DIR}/include_juce_events.cpp"
)

target_compile_features(vital PRIVATE cxx_std_17)

target_compile_definitions(vital PRIVATE
  BUILD_DATE=2026-08-29-00-00
  HEADLESS=1
  LINUX=1
  NO_AUTH=1
  JUCE_APP_VERSION=1.0.6
  JUCE_APP_VERSION_HEX=0x10006
  JUCE_CATCH_UNHANDLED_EXCEPTIONS=0
  JUCE_CHECK_MEMORY_LEAKS=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  JUCE_DONT_DECLARE_PROJECTINFO=0
  JUCE_LINUX=1
  JUCE_LOG_ASSERTIONS=0
  JUCE_NO_INLINE_ASM=1
  JUCE_STANDALONE_APPLICATION=0
  JUCE_USE_CURL=0
  JUCE_USE_FLAC=0
  JUCE_USE_OGGVORBIS=0
  _X86_=1
)

target_include_directories(vital PRIVATE
  "${VITAL_JUCE_LIBRARY_DIR}"
  "${VITAL_JUCE_MODULE_DIR}"
  "${VITAL_SOURCE_DIR}/src/common"
  "${VITAL_SOURCE_DIR}/src/common/wavetable"
  "${VITAL_SOURCE_DIR}/src/interface/editor_components"
  "${VITAL_SOURCE_DIR}/src/interface/editor_sections"
  "${VITAL_SOURCE_DIR}/src/interface/look_and_feel"
  "${VITAL_SOURCE_DIR}/src/interface/wavetable"
  "${VITAL_SOURCE_DIR}/src/interface/wavetable/editors"
  "${VITAL_SOURCE_DIR}/src/interface/wavetable/overlays"
  "${VITAL_SOURCE_DIR}/src/standalone"
  "${VITAL_SOURCE_DIR}/src/synthesis/effects"
  "${VITAL_SOURCE_DIR}/src/synthesis/filters"
  "${VITAL_SOURCE_DIR}/src/synthesis/framework"
  "${VITAL_SOURCE_DIR}/src/synthesis/lookups"
  "${VITAL_SOURCE_DIR}/src/synthesis/modulators"
  "${VITAL_SOURCE_DIR}/src/synthesis/modules"
  "${VITAL_SOURCE_DIR}/src/synthesis/producers"
  "${VITAL_SOURCE_DIR}/src/synthesis/synth_engine"
  "${VITAL_SOURCE_DIR}/src/synthesis/utilities"
  "${VITAL_SOURCE_DIR}/third_party"
)

target_compile_options(vital PRIVATE
  -fexceptions
  -ffast-math
  -msimd128
  -msse2
  "$<$<CONFIG:Release>:-O2>"
  "$<$<CONFIG:RelWithDebInfo>:-O2>"
  "$<$<CONFIG:MinSizeRel>:-Oz>"
  "$<$<CONFIG:Debug>:-O0;-g3>"
)

target_link_options(vital PRIVATE
  -fexceptions
  -msimd128
  "-sALLOW_MEMORY_GROWTH=1"
  "$<$<NOT:$<CONFIG:Debug>>:-sASSERTIONS=1>"
  "$<$<CONFIG:Debug>:-gsource-map;-sASSERTIONS=2;-sSAFE_HEAP=1>"
  "-sDISABLE_EXCEPTION_CATCHING=0"
  "-sENVIRONMENT=web,worker,node"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_vital_create','_vital_destroy','_vital_load_state','_vital_begin_load_state','_vital_step_load_state','_vital_finish_load_state','_vital_set_bpm','_vital_note_on','_vital_note_off','_vital_all_notes_off','_vital_process']"
  "-sEXPORT_ES6=1"
  "-sEXPORT_NAME=createVitalModule"
  "-sFILESYSTEM=0"
  "-sMODULARIZE=1"
  "-sNO_EXIT_RUNTIME=1"
  "-sSTACK_SIZE=5242880"
)

set_target_properties(vital PROPERTIES
  OUTPUT_NAME vital
  SUFFIX ".mjs"
)
