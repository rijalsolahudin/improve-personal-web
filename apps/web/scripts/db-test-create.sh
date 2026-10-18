#!/bin/sh
# Pastikan database TEST ada di container Postgres yang sudah jalan di mesin ini.
#
# Repo ini TIDAK punya docker-compose untuk database: instance Postgres dev/test di mesin developer
# sudah dijalankan sebagai container layanan lokal (default: `local-postgres`). Berkas ini meminjam
# instance itu apa adanya, jadi tidak ada Postgres kedua yang perlu dinyalakan/dimatikan.
#
# Kenapa dipisah dari database dev: test menghapus barisnya sendiri (user, device, sesi, record),
# jadi dia harus punya database SENDIRI supaya tidak pernah menyentuh data development siapa pun.
#
# Nama container & nama database bisa diganti lewat env; kredensial superuser lokal dipakai hanya
# untuk MEMBUAT database - skrip tidak menyentuh database lain di container yang sama.
set -eu

container="${IMPROVE_PG_CONTAINER:-local-postgres}"
db="${IMPROVE_PG_TEST_DB:-improve_personal_test}"

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "Container '$container' tidak ditemukan." >&2
  echo "Nyalakan Postgres lokal dulu, atau set IMPROVE_PG_CONTAINER ke nama container yang benar." >&2
  exit 1
fi

if [ "$(docker exec "$container" psql -U postgres -Atc "select 1 from pg_database where datname='$db'")" = "1" ]; then
  echo "Database '$db' sudah ada di container '$container'."
  exit 0
fi

docker exec "$container" psql -U postgres -c "CREATE DATABASE $db" >/dev/null
echo "Database '$db' dibuat di container '$container'."
