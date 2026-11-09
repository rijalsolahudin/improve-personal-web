-- RESET SATU ARAH (pre-launch): blob lama disegel kunci per akun di client, jadi server TIDAK BISA
-- membukanya dengan kunci at-rest yang baru. Semua record lama dihapus supaya tidak ada baris yang
-- selamanya gagal didekripsi. Sudah disepakati: belum ada data produksi.
DELETE FROM "records";--> statement-breakpoint
ALTER TABLE "account_keys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "key_envelopes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "key_transfers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "account_keys" CASCADE;--> statement-breakpoint
DROP TABLE "key_envelopes" CASCADE;--> statement-breakpoint
DROP TABLE "key_transfers" CASCADE;--> statement-breakpoint
ALTER TABLE "records" DROP CONSTRAINT "ck_records_kid_len";--> statement-breakpoint
ALTER TABLE "records" DROP COLUMN "kid";--> statement-breakpoint
DROP TYPE "public"."key_slot";