CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'member');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;