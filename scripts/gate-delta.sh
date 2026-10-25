#!/usr/bin/env bash
# Gate verifikasi delta - bagian mekanis dari QA (T1/T2), bukan pengganti penilaian QA.
#
# Kenapa ada: QA menghabiskan waktu menyusun daftar test manual + menjalankan lint
# yang itu-itu lagi. Script ini memilih test lewat import graph (vitest related),
# jalan hanya untuk file delta, lalu mencetak ringkasan yang bisa langsung
# ditempel ke komentar task. Penilaian AC, tiga pilar, dan verdict tetap milik QA.
#
# DILARANG dipakai untuk suite penuh / build / Lighthouse (itu T3, task payung).
#
# Contoh:
#   bash scripts/gate-delta.sh                          # delta working tree, tier t1
#   bash scripts/gate-delta.sh --tier t2                # + typecheck paket tersentuh
#   bash scripts/gate-delta.sh --base master            # + commit sejak `master`
#   bash scripts/gate-delta.sh --files apps/web/app/x.vue,packages/core/src/y.ts
#   bash scripts/gate-delta.sh --list                   # lihat file & paket terdeteksi
#
# Exit: 0 semua langkah lulus, 1 ada langkah gagal, 2 argumen salah.

set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TIER="t1"
BASE=""
FILES_INPUT=""
LIST_ONLY=0
RUN_LINT=1
RUN_TEST=1
RUN_TYPECHECK="auto"

TEST_TIMEOUT="${GATE_TEST_TIMEOUT:-600}"
LINT_TIMEOUT="${GATE_LINT_TIMEOUT:-300}"
TYPECHECK_TIMEOUT="${GATE_TYPECHECK_TIMEOUT:-900}"

usage() {
  cat <<'EOF'
Pemakaian: bash scripts/gate-delta.sh [opsi] [file...]

  --tier t1|t2     t1 = lint + test terkait (default), t2 = + typecheck paket
  --base <ref>     ikutkan commit `ref...HEAD`, bukan hanya working tree
  --files <a,b,c>  pakai daftar file ini, bukan deteksi git
  --list           cetak file delta + paket terdeteksi, tidak menjalankan apa pun
  --no-lint        lewati prettier + eslint
  --no-test        lewati vitest related
  --no-typecheck   lewati typecheck (walau tier t2)
  -h, --help       tampilkan bantuan ini

Env: GATE_TEST_TIMEOUT, GATE_LINT_TIMEOUT, GATE_TYPECHECK_TIMEOUT (detik).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tier) TIER="${2:-}"; shift 2 || shift ;;
    --tier=*) TIER="${1#*=}"; shift ;;
    --base) BASE="${2:-}"; shift 2 || shift ;;
    --base=*) BASE="${1#*=}"; shift ;;
    --files) FILES_INPUT="$FILES_INPUT ${2:-}"; shift 2 || shift ;;
    --files=*) FILES_INPUT="$FILES_INPUT ${1#*=}"; shift ;;
    --list) LIST_ONLY=1; shift ;;
    --no-lint) RUN_LINT=0; shift ;;
    --no-test) RUN_TEST=0; shift ;;
    --no-typecheck) RUN_TYPECHECK=0; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "gate-delta: opsi tidak dikenal: $1" >&2; usage >&2; exit 2 ;;
    *) FILES_INPUT="$FILES_INPUT $1"; shift ;;
  esac
done

case "$TIER" in
  t1 | t2) ;;
  *)
    echo "gate-delta: --tier hanya t1 atau t2 (t3 = task payung/rilis, jalankan manual)" >&2
    exit 2
    ;;
esac

FILES_INPUT="$(printf '%s' "$FILES_INPUT" | tr ',' ' ')"

RAW="$(mktemp)"
PKG_WEB="$(mktemp)"
PKG_CORE="$(mktemp)"
PKG_CONTRACTS="$(mktemp)"
PKG_TOKENS="$(mktemp)"
SUMMARY="$(mktemp)"
LOG="$(mktemp)"
cleanup() { rm -f "$RAW" "$PKG_WEB" "$PKG_CORE" "$PKG_CONTRACTS" "$PKG_TOKENS" "$SUMMARY" "$LOG"; }
trap cleanup EXIT

# --- 1. Kumpulkan file delta -------------------------------------------------

if [ -n "$FILES_INPUT" ]; then
  for f in $FILES_INPUT; do printf '%s\n' "$f"; done >"$RAW"
else
  {
    git diff --name-only --diff-filter=ACMR
    git diff --cached --name-only --diff-filter=ACMR
    git ls-files --others --exclude-standard
    if [ -n "$BASE" ]; then git diff --name-only --diff-filter=ACMR "$BASE"...HEAD; fi
  } >"$RAW"
fi

is_code() {
  case "$1" in
    *.ts | *.mts | *.cts | *.js | *.mjs | *.cjs | *.vue) return 0 ;;
    *) return 1 ;;
  esac
}

is_prettier() {
  case "$1" in
    *.ts | *.mts | *.cts | *.js | *.mjs | *.cjs | *.vue | *.json | *.jsonc | *.md | *.css | *.yml | *.yaml | *.html) return 0 ;;
    *) return 1 ;;
  esac
}

# File yang tidak ada (hasil hapus/rename) dan artefak build tidak ikut digate.
: >"$PKG_WEB"
: >"$PKG_CORE"
: >"$PKG_CONTRACTS"
: >"$PKG_TOKENS"

FILES="$(awk 'NF' "$RAW" | awk '!seen[$0]++')"
COUNT=0
PRETTIER_FILES=""
SKIPPED=""
UNMAPPED=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    "$ROOT"/*) f="${f#"$ROOT"/}" ;;
  esac
  case "$f" in
    node_modules/* | .nuxt/* | .output/* | dist/* | .turbo/* | graphify-out/*)
      SKIPPED="$SKIPPED $f"
      continue
      ;;
  esac
  if [ ! -f "$f" ]; then
    SKIPPED="$SKIPPED $f"
    continue
  fi
  COUNT=$((COUNT + 1))
  if is_prettier "$f"; then PRETTIER_FILES="$PRETTIER_FILES $f"; fi
  MAPPED=0
  case "$f" in
    apps/web/*)
      printf '%s\n' "${f#apps/web/}" >>"$PKG_WEB"
      MAPPED=1
      ;;
    packages/core/*)
      printf '%s\n' "${f#packages/core/}" >>"$PKG_CORE"
      MAPPED=1
      ;;
    packages/contracts/*)
      printf '%s\n' "${f#packages/contracts/}" >>"$PKG_CONTRACTS"
      MAPPED=1
      ;;
    packages/tokens/*)
      printf '%s\n' "${f#packages/tokens/}" >>"$PKG_TOKENS"
      MAPPED=1
      ;;
  esac
  if [ "$MAPPED" -eq 0 ]; then
    case "$f" in
      apps/* | packages/*) UNMAPPED="$UNMAPPED $f" ;;
    esac
  fi
done <<EOF
$FILES
EOF

if [ -n "${SKIPPED// /}" ]; then
  echo "gate-delta: dilewati (file tidak ada / artefak build):$SKIPPED" >&2
fi
if [ -n "${UNMAPPED// /}" ]; then
  echo "gate-delta: tidak ada gate otomatis untuk:$UNMAPPED" >&2
  echo "  (paket belum ter-scaffold / di luar peta paket) - verifikasi manual, tulis alasannya di report." >&2
fi

if [ "$COUNT" -eq 0 ]; then
  echo "gate-delta: tidak ada file delta (working tree bersih)."
  echo "Pakai --base <ref> untuk commit, atau --files <a,b> untuk daftar manual."
  exit 0
fi

pkg_list() { # $1 = file daftar, cetak hanya file kode
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if is_code "$f"; then printf '%s\n' "$f"; fi
  done <"$1"
}

count_lines() { # $1 = file
  awk 'NF' "$1" | wc -l | tr -d ' '
}

if [ "$LIST_ONLY" -eq 1 ]; then
  echo "gate-delta: $COUNT file delta (tier $TIER${BASE:+, base $BASE})"
  printf '%s\n' "$FILES" | while IFS= read -r f; do [ -n "$f" ] && echo "  $f"; done
  for pair in "apps/web:$PKG_WEB" "packages/core:$PKG_CORE" "packages/contracts:$PKG_CONTRACTS" "packages/tokens:$PKG_TOKENS"; do
    dir="${pair%%:*}"
    list="${pair#*:}"
    n=$(count_lines "$list")
    [ "$n" -gt 0 ] && echo "  -> $dir: $n file"
  done
  exit 0
fi

# --- 2. Runner + ringkasan ---------------------------------------------------

FAILED=0
EXECUTED=0
PACKAGE_STEPS=0
TOTAL_START=$(date +%s)

with_timeout() { # $1 = detik, sisanya perintah
  local limit="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$limit" "$@"
  else
    "$@"
  fi
}

step() { # $1 = label, $2 = detik, sisanya perintah
  local label="$1"
  local limit="$2"
  shift 2
  local start end dur rc=0
  start=$(date +%s)
  EXECUTED=$((EXECUTED + 1))
  if [ "$label" != "prettier" ]; then PACKAGE_STEPS=$((PACKAGE_STEPS + 1)); fi
  : >"$LOG"
  with_timeout "$limit" "$@" >"$LOG" 2>&1 || rc=$?
  end=$(date +%s)
  dur=$((end - start))
  if [ "$rc" -eq 0 ]; then
    if [ "$label" = "vitest" ]; then
      tf="$(grep -Eo 'Test Files[[:space:]]+[0-9]+ (passed|failed)' "$LOG" | head -n 1 | tr -s ' ')"
      ts="$(grep -Eo 'Tests[[:space:]]+[0-9]+ (passed|failed)' "$LOG" | head -n 1 | tr -s ' ')"
      extra=""
      if [ -n "$tf" ]; then extra="$tf"; fi
      if [ -n "$ts" ]; then
        if [ -n "$extra" ]; then extra="$extra, $ts"; else extra="$ts"; fi
      fi
      if [ -n "$extra" ]; then DETAIL="$DETAIL | $extra"; fi
    fi
    printf '  %-10s PASS  %3ss  %s\n' "$label" "$dur" "$DETAIL"
    printf '%s|PASS|%ss|%s\n' "$label" "$dur" "$DETAIL" >>"$SUMMARY"
  elif [ "$rc" -eq 124 ]; then
    printf '  %-10s TIMEOUT %3ss (batas %ss)  %s\n' "$label" "$dur" "$limit" "$DETAIL"
    printf '%s|TIMEOUT|%ss|%s\n' "$label" "$dur" "$DETAIL" >>"$SUMMARY"
    FAILED=1
  else
    printf '  %-10s FAIL  %3ss  %s\n' "$label" "$dur" "$DETAIL"
    tail -n 25 "$LOG" | sed 's/^/      /'
    printf '%s|FAIL|%ss|%s\n' "$label" "$dur" "$DETAIL" >>"$SUMMARY"
    FAILED=1
  fi
}

skip() { # $1 = label, $2 = alasan
  printf '  %-10s SKIP  %s\n' "$1" "$2"
  printf '%s|SKIP|-|%s\n' "$1" "$2" >>"$SUMMARY"
}

echo "gate-delta tier=$TIER files=$COUNT${BASE:+ base=$BASE}"

# --- 3. Prettier -------------------------------------------------------------

if [ "$RUN_LINT" -eq 1 ]; then
  if [ -n "${PRETTIER_FILES// /}" ]; then
    # shellcheck disable=SC2086
    DETAIL="$COUNT file"
    step prettier "$LINT_TIMEOUT" pnpm exec prettier --check $PRETTIER_FILES
  else
    skip prettier "tidak ada file yang dicek prettier"
  fi
else
  skip prettier "--no-lint"
fi

# --- 4. Eslint per paket -----------------------------------------------------

if [ "$RUN_LINT" -eq 1 ]; then
  ESLINT_ANY=0
  for pair in "@improve-personal/web:$PKG_WEB" "@improve-personal/core:$PKG_CORE" "@improve-personal/contracts:$PKG_CONTRACTS" "@improve-personal/tokens:$PKG_TOKENS"; do
    pkg="${pair%%:*}"
    list="${pair#*:}"
    n=$(count_lines "$list")
    [ "$n" -gt 0 ] || continue
    ESLINT_FILES="$(pkg_list "$list" | tr '\n' ' ')"
    [ -n "${ESLINT_FILES// /}" ] || continue
    ESLINT_ANY=1
    DETAIL="$pkg $n file"
    # shellcheck disable=SC2086
    step "eslint" "$LINT_TIMEOUT" pnpm --filter "$pkg" exec eslint --max-warnings 0 $ESLINT_FILES
  done
  [ "$ESLINT_ANY" -eq 1 ] || skip eslint "tidak ada file kode di paket"
else
  skip eslint "--no-lint"
fi

# --- 5. Vitest related per paket --------------------------------------------

if [ "$RUN_TEST" -eq 1 ]; then
  VITEST_ANY=0
  for pair in "@improve-personal/web:$PKG_WEB" "@improve-personal/core:$PKG_CORE" "@improve-personal/contracts:$PKG_CONTRACTS" "@improve-personal/tokens:$PKG_TOKENS"; do
    pkg="${pair%%:*}"
    list="${pair#*:}"
    n=$(count_lines "$list")
    [ "$n" -gt 0 ] || continue
    TEST_FILES="$(pkg_list "$list" | tr '\n' ' ')"
    [ -n "${TEST_FILES// /}" ] || continue
    VITEST_ANY=1
    DETAIL="$pkg $n file"
    # shellcheck disable=SC2086
    step "vitest" "$TEST_TIMEOUT" pnpm --filter "$pkg" exec vitest related $TEST_FILES --run --passWithNoTests
  done
  [ "$VITEST_ANY" -eq 1 ] || skip vitest "tidak ada file kode di paket"
else
  skip vitest "--no-test"
fi

# --- 6. Typecheck (tier t2) -------------------------------------------------

if [ "$TIER" = "t2" ] && [ "$RUN_TYPECHECK" != "0" ]; then
  for pair in "@improve-personal/web:$PKG_WEB" "@improve-personal/core:$PKG_CORE" "@improve-personal/contracts:$PKG_CONTRACTS" "@improve-personal/tokens:$PKG_TOKENS"; do
    pkg="${pair%%:*}"
    list="${pair#*:}"
    n=$(count_lines "$list")
    [ "$n" -gt 0 ] || continue
    DETAIL="$pkg"
    step "typecheck" "$TYPECHECK_TIMEOUT" pnpm --filter "$pkg" run typecheck
  done
else
  skip typecheck "tier $TIER (jalankan --tier t2 bila perlu)"
fi

# --- 7. Ringkasan siap tempel ----------------------------------------------

TOTAL_END=$(date +%s)
TOTAL_DUR=$((TOTAL_END - TOTAL_START))
UNMAPPED_COUNT=0
if [ -n "${UNMAPPED// /}" ]; then
  UNMAPPED_COUNT=$(printf '%s\n' "$UNMAPPED" | wc -w | tr -d ' ')
  printf '%s|SKIP|-|%s file di luar peta paket - verifikasi manual\n' "unmapped" "$UNMAPPED_COUNT" >>"$SUMMARY"
fi

if [ "$FAILED" -ne 0 ]; then
  VERDICT="FAIL"
elif [ "$UNMAPPED_COUNT" -gt 0 ] && [ "$PACKAGE_STEPS" -eq 0 ]; then
  # Formatting saja bukan bukti AC - jangan tampil hijau kalau tidak ada paket yang digate.
  VERDICT="MANUAL"
else
  VERDICT="PASS"
fi

echo
echo "GATE-DELTA tier=$TIER files=$COUNT -> $VERDICT (${TOTAL_DUR}s)"
while IFS='|' read -r label status dur detail; do
  printf -- '- %s: %s (%s) %s\n' "$label" "$status" "$dur" "$detail"
done <"$SUMMARY"

exit "$FAILED"
