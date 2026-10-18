CREATE TYPE "public"."client_kind" AS ENUM('web', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('web', 'ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."key_slot" AS ENUM('passkey');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'delete_account');--> statement-breakpoint
CREATE SEQUENCE "public"."records_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ip_city" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "key_envelopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"slot" "key_slot" NOT NULL,
	"wrapped_key" "bytea" NOT NULL,
	"kdf_params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"blob" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"client" "client_kind" NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'login' NOT NULL,
	"ip_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"scope" text NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_rate_limits" PRIMARY KEY("scope","bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "records" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"hlc" text NOT NULL,
	"hlc_wall_ms" bigint NOT NULL,
	"hlc_counter" integer NOT NULL,
	"hlc_device" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"blob" "bytea" NOT NULL,
	"server_seq" bigint DEFAULT nextval('records_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_records" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"client" "client_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_watermarks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"purged_seq" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_envelopes" ADD CONSTRAINT "key_envelopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_transfers" ADD CONSTRAINT "key_transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_transfers" ADD CONSTRAINT "key_transfers_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_watermarks" ADD CONSTRAINT "sync_watermarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_devices_user_created" ON "devices" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_key_envelopes_user_slot" ON "key_envelopes" USING btree ("user_id","slot");--> statement-breakpoint
CREATE INDEX "idx_key_transfers_expires" ON "key_transfers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_states_expires" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_otp_expires" ON "otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_records_user_server_seq" ON "records" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "idx_records_hlc" ON "records" USING btree ("hlc_wall_ms","hlc_counter","hlc_device","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sessions_token_hash" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");