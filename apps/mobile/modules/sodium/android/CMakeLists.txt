cmake_minimum_required(VERSION 3.22.1)
project(ipsodium C)

# libsodium statis per ABI dari scripts/build-libsodium.sh android (sumber terverifikasi minisign +
# SHA-256). Tidak ada fallback ke binary lain: kalau belum dibangun, konfigurasi berhenti di sini.
set(SODIUM_PREFIX "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/android/${ANDROID_ABI}")
if(NOT EXISTS "${SODIUM_PREFIX}/lib/libsodium.a")
  message(FATAL_ERROR
    "libsodium untuk ${ANDROID_ABI} belum dibangun. Jalankan: "
    "bash modules/sodium/scripts/build-libsodium.sh android")
endif()

add_library(sodium STATIC IMPORTED)
set_target_properties(sodium PROPERTIES IMPORTED_LOCATION "${SODIUM_PREFIX}/lib/libsodium.a")

add_library(ipsodium SHARED
  src/main/cpp/ip_sodium_jni.c
  ../cpp/ip_sodium.c)

target_include_directories(ipsodium PRIVATE ../cpp "${SODIUM_PREFIX}/include")
target_compile_options(ipsodium PRIVATE -Wall -Wextra -Werror -Wno-unused-parameter -O2)
# Halaman 16 KB (syarat Play Store untuk Android 15+); simbol libsodium tidak diekspor ulang.
target_link_options(ipsodium PRIVATE
  "-Wl,-z,max-page-size=16384"
  "-Wl,--exclude-libs,ALL")
target_link_libraries(ipsodium PRIVATE sodium)
