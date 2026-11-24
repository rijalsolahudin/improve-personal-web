#!/usr/bin/env bash
# Bangun libsodium dari SUMBER resmi yang terverifikasi untuk modul `sodium` (#181).
#
#   bash build-libsodium.sh fetch      # unduh + verifikasi saja (minisign + SHA-256)
#   bash build-libsodium.sh host       # libsodium.a untuk mesin ini (uji vektor host)
#   bash build-libsodium.sh android    # .a per ABI (butuh ANDROID_NDK_HOME, NDK versi pin)
#   bash build-libsodium.sh ios        # Clibsodium.xcframework (butuh macOS + Xcode)
#
# Hasil: ../vendor/<target>/ (di-.gitignore - TIDAK ada binary yang di-commit). Setiap target menulis
# vendor/<target>/BUILD-MANIFEST.txt: versi, SHA-256 tarball, toolchain, dan SHA-256 tiap artefak,
# supaya CI bisa membuktikan artefak di app = hasil build dari sumber yang lolos verifikasi.
#
# Verifikasi WAJIB lulus sebelum tarball diekstrak:
#   1. SHA-256 tarball == LIBSODIUM_SHA256 (dipin di libsodium.lock).
#   2. Tanda tangan minisign dengan LIBSODIUM_MINISIGN_PUBKEY (dipin), trusted comment harus
#      menyebut nama tarball. Pakai binary `minisign` bila ada; kalau tidak, verify-minisign.mjs
#      (Ed25519 + BLAKE2b-512 dari node:crypto).
# Gagal di salah satu = berhenti, tidak ada yang dibangun.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Override untuk filesystem yang menolak chmod (mis. NTFS/exFAT): `make install` butuh chmod.
VENDOR_DIR="${LIBSODIUM_VENDOR_DIR:-$MODULE_DIR/vendor}"
# shellcheck source=./libsodium.lock
source "$SCRIPT_DIR/libsodium.lock"

# Tarball & sumber diekstrak di direktori kerja sementara, terpisah dari repo.
WORK_DIR="${LIBSODIUM_WORK_DIR:-$(mktemp -d)}"
DOWNLOAD_DIR="$WORK_DIR/download"
SOURCE_PARENT="$WORK_DIR/source"
SOURCE_DIR="$SOURCE_PARENT/libsodium-$LIBSODIUM_VERSION"

# Waktu & urutan arsip tetap, supaya dua build dengan toolchain yang sama menghasilkan byte sama.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1767225600}"
export ZERO_AR_DATE=1
export LC_ALL=C
export TZ=UTC

log() { printf '[build-libsodium] %s\n' "$*" >&2; }
die() {
  printf '[build-libsodium] GAGAL: %s\n' "$*" >&2
  exit 1
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

nproc_count() { getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4; }

fetch_and_verify() {
  mkdir -p "$DOWNLOAD_DIR"
  local tarball="$DOWNLOAD_DIR/$LIBSODIUM_TARBALL"
  if [[ ! -f "$tarball" ]]; then
    log "unduh $LIBSODIUM_URL"
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      -o "$tarball" "$LIBSODIUM_URL"
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      -o "$tarball.minisig" "$LIBSODIUM_URL.minisig"
  fi

  local actual
  actual="$(sha256_of "$tarball")"
  [[ "$actual" == "$LIBSODIUM_SHA256" ]] ||
    die "SHA-256 tidak cocok: dapat $actual, pin $LIBSODIUM_SHA256"
  log "SHA-256 OK $actual"

  if command -v minisign >/dev/null 2>&1; then
    minisign -V -P "$LIBSODIUM_MINISIGN_PUBKEY" -m "$tarball" -x "$tarball.minisig" >&2 ||
      die "minisign menolak tarball"
    grep -q "file:$LIBSODIUM_TARBALL" "$tarball.minisig" ||
      die "trusted comment tidak menyebut $LIBSODIUM_TARBALL"
    log "minisign OK (binary minisign)"
  else
    node "$SCRIPT_DIR/verify-minisign.mjs" "$LIBSODIUM_MINISIGN_PUBKEY" "$tarball" \
      "$tarball.minisig" "$LIBSODIUM_TARBALL" >&2 || die "minisign menolak tarball"
  fi

  rm -rf "$SOURCE_PARENT"
  mkdir -p "$SOURCE_PARENT"
  tar -xzf "$tarball" -C "$SOURCE_PARENT"
  [[ -x "$SOURCE_DIR/configure" ]] || die "isi tarball tidak terduga (configure tidak ada)"
}

write_manifest() {
  local target_dir="$1" toolchain="$2"
  local manifest="$target_dir/BUILD-MANIFEST.txt"
  {
    echo "libsodium $LIBSODIUM_VERSION"
    echo "source $LIBSODIUM_URL"
    echo "source-sha256 $LIBSODIUM_SHA256"
    echo "minisign-pubkey $LIBSODIUM_MINISIGN_PUBKEY"
    echo "toolchain $toolchain"
    echo "source-date-epoch $SOURCE_DATE_EPOCH"
    (cd "$target_dir" && find . -type f \( -name '*.a' -o -name '*.h' \) | sort |
      while read -r file; do echo "artifact $(sha256_of "$file") ${file#./}"; done)
  } >"$manifest"
  log "manifest: $manifest"
}

# configure + make di salinan sumber yang bersih, lalu install ke prefix.
configure_and_install() {
  local prefix="$1"
  shift
  (
    cd "$SOURCE_DIR"
    make distclean >/dev/null 2>&1 || true
    # Path direktori kerja (acak per build) tidak boleh ikut ke debug info/__FILE__ artefak.
    export CFLAGS="${CFLAGS:--O2} -ffile-prefix-map=$SOURCE_PARENT=/libsodium-src"
    ./configure --disable-shared --enable-static --with-pic --disable-dependency-tracking \
      --prefix="$prefix" "$@" >"$WORK_DIR/configure.log" 2>&1 ||
      die "configure gagal, lihat $WORK_DIR/configure.log"
    make -j"$(nproc_count)" install >"$WORK_DIR/make.log" 2>&1 ||
      die "make gagal, lihat $WORK_DIR/make.log"
    # `make install` menjalankan ranlib yang menulis jam sekarang ke header tabel simbol; mode
    # deterministik (-D) menolkan timestamp itu.
    "${RANLIB:-ranlib}" -D "$prefix/lib/libsodium.a"
  )
}

build_host() {
  local prefix="$VENDOR_DIR/host"
  rm -rf "$prefix"
  configure_and_install "$prefix"
  if [[ "${LIBSODIUM_RUN_CHECK:-1}" == "1" ]]; then
    (cd "$SOURCE_DIR" && make -j"$(nproc_count)" check >"$WORK_DIR/check.log" 2>&1) ||
      die "test suite libsodium gagal, lihat $WORK_DIR/check.log"
    log "make check: $(grep -E '^# PASS' "$WORK_DIR/check.log" | head -1)"
  fi
  write_manifest "$prefix" "$(${CC:-cc} --version | head -1)"
}

android_host_triple() {
  case "$1" in
    arm64-v8a) echo aarch64-linux-android ;;
    armeabi-v7a) echo armv7a-linux-androideabi ;;
    x86_64) echo x86_64-linux-android ;;
    *) die "ABI tidak didukung: $1" ;;
  esac
}

# Flag CPU disalin dari dist-build/android-*.sh upstream 1.0.21.
android_cflags() {
  case "$1" in
    arm64-v8a) echo "-Os -march=armv8-a+crypto" ;;
    armeabi-v7a) echo "-Os -mfloat-abi=softfp -mfpu=vfpv3-d16 -mthumb -marm -march=armv7-a" ;;
    x86_64) echo "-Os -march=westmere" ;;
  esac
}

build_android() {
  [[ -n "${ANDROID_NDK_HOME:-}" ]] || die "ANDROID_NDK_HOME belum di-set"
  local ndk_version
  ndk_version="$(sed -n 's/^Pkg.Revision *= *//p' "$ANDROID_NDK_HOME/source.properties")"
  [[ "$ndk_version" == "$ANDROID_NDK_VERSION" ]] ||
    die "NDK $ndk_version, pin $ANDROID_NDK_VERSION (ubah pin lewat review, jangan dilewati)"

  local host_os toolchain
  host_os="$(uname | tr '[:upper:]' '[:lower:]')-x86_64"
  toolchain="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$host_os"

  for abi in $ANDROID_ABIS; do
    local triple prefix
    triple="$(android_host_triple "$abi")"
    prefix="$VENDOR_DIR/android/$abi"
    rm -rf "$prefix"
    log "android $abi ($triple, API $ANDROID_MIN_API)"
    CC="$toolchain/bin/${triple}${ANDROID_MIN_API}-clang" \
      AR="$toolchain/bin/llvm-ar" RANLIB="$toolchain/bin/llvm-ranlib" \
      CFLAGS="$(android_cflags "$abi")" \
      configure_and_install "$prefix" --host="$triple" --with-sysroot="$toolchain/sysroot"
    write_manifest "$prefix" "android-ndk $ndk_version api $ANDROID_MIN_API"
  done
}

build_ios() {
  [[ "$(uname)" == "Darwin" ]] || die "target ios butuh macOS + Xcode"
  # Skrip resmi upstream; FULL build (bukan minimal) karena secretstream/pwhash/pad dibutuhkan.
  (
    cd "$SOURCE_DIR"
    unset LIBSODIUM_MINIMAL_BUILD
    IOS_VERSION_MIN="$IOS_MIN_VERSION" ./dist-build/apple-xcframework.sh \
      >"$WORK_DIR/apple.log" 2>&1 || die "apple-xcframework.sh gagal, lihat $WORK_DIR/apple.log"
  )
  rm -rf "$VENDOR_DIR/ios"
  mkdir -p "$VENDOR_DIR/ios"
  cp -R "$SOURCE_DIR/libsodium-apple/Clibsodium.xcframework" "$VENDOR_DIR/ios/"
  write_manifest "$VENDOR_DIR/ios" "$(xcodebuild -version | tr '\n' ' ')"
}

main() {
  local target="${1:-}"
  case "$target" in
    fetch) fetch_and_verify ;;
    host) fetch_and_verify && build_host ;;
    android) fetch_and_verify && build_android ;;
    ios) fetch_and_verify && build_ios ;;
    *) die "pemakaian: build-libsodium.sh fetch|host|android|ios" ;;
  esac
  log "selesai: $target"
}

main "$@"
