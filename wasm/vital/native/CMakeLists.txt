cmake_minimum_required(VERSION 3.22)

project(vital_native_reference LANGUAGES CXX)

if(EMSCRIPTEN)
  message(FATAL_ERROR "Configure the native reference with a host compiler, not emcmake")
endif()

if(APPLE)
  enable_language(OBJCXX)
endif()

set(VITAL_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../vendor/vital" CACHE PATH "Pinned Vital source checkout")

if(NOT EXISTS "${VITAL_SOURCE_DIR}/src/common/synth_base.cpp")
  message(FATAL_ERROR "Vital source is unavailable at ${VITAL_SOURCE_DIR}; run ../fetch-source.sh")
endif()

set(VITAL_JUCE_LIBRARY_DIR "${VITAL_SOURCE_DIR}/headless/JuceLibraryCode")
set(VITAL_JUCE_MODULE_DIR "${VITAL_SOURCE_DIR}/third_party/JUCE/modules")

if(APPLE)
  set(VITAL_JUCE_TRANSLATION_UNITS
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_audio_basics.mm"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_audio_formats.mm"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_core.mm"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_data_structures.mm"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_dsp.mm"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_events.mm"
  )
else()
  set(VITAL_JUCE_TRANSLATION_UNITS
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_audio_basics.cpp"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_audio_formats.cpp"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_core.cpp"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_data_structures.cpp"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_dsp.cpp"
    "${VITAL_JUCE_LIBRARY_DIR}/include_juce_events.cpp"
  )
endif()

add_executable(vital-native-render
  "${CMAKE_CURRENT_SOURCE_DIR}/../bridge.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/../tools/render-schedule.cpp"
  "${VITAL_SOURCE_DIR}/src/unity_build/common.cpp"
  "${VITAL_SOURCE_DIR}/src/unity_build/synthesis.cpp"
  ${VITAL_JUCE_TRANSLATION_UNITS}
)

target_compile_features(vital-native-render PRIVATE cxx_std_17)

target_compile_definitions(vital-native-render PRIVATE
  BUILD_DATE=2026-08-29-00-00
  HEADLESS=1
  NO_AUTH=1
  JUCE_APP_VERSION=1.0.6
  JUCE_APP_VERSION_HEX=0x10006
  JUCE_CATCH_UNHANDLED_EXCEPTIONS=0
  JUCE_CHECK_MEMORY_LEAKS=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  JUCE_DONT_DECLARE_PROJECTINFO=0
  JUCE_LOG_ASSERTIONS=0
  JUCE_STANDALONE_APPLICATION=0
  JUCE_USE_CURL=0
  JUCE_USE_FLAC=0
  JUCE_USE_OGGVORBIS=0
  _X86_=1
)

if(UNIX AND NOT APPLE)
  target_compile_definitions(vital-native-render PRIVATE JUCE_LINUX=1 LINUX=1)
endif()

target_include_directories(vital-native-render PRIVATE
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

target_compile_options(vital-native-render PRIVATE
  -fexceptions
  -ffast-math
  -msse2
  "$<$<CONFIG:Release>:-O2>"
  "$<$<CONFIG:RelWithDebInfo>:-O2>"
  "$<$<CONFIG:Debug>:-O0;-g3>"
)

if(APPLE)
  target_link_libraries(vital-native-render PRIVATE
    "-framework Accelerate"
    "-framework AudioToolbox"
    "-framework Cocoa"
    "-framework CoreAudio"
    "-framework CoreFoundation"
    "-framework Foundation"
    "-framework IOKit"
  )
elseif(UNIX)
  find_package(Threads REQUIRED)
  target_link_libraries(vital-native-render PRIVATE Threads::Threads ${CMAKE_DL_LIBS})
endif()
