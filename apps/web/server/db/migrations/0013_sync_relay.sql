CREATE TABLE "sync_expired" (
	"device_id" uuid NOT NULL,
	"from_device_id" uuid NOT NULL,
	"up_to_seq" bigint NOT NULL,
	"noted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_sync_expired" PRIMARY KEY("device_id","from_device_id")
);
--> statement-breakpoint
CREATE TABLE "sync_frames" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"license_id" uuid NOT NULL,
	"sender_device_id" uuid NOT NULL,
	"epoch" integer NOT NULL,
	"seq" bigint,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_pending" (
	"device_id" uuid NOT NULL,
	"frame_id" bigint NOT NULL,
	CONSTRAINT "pk_sync_pending" PRIMARY KEY("device_id","frame_id")
);
--> statement-breakpoint
CREATE TABLE "sync_usage" (
	"license_id" uuid NOT NULL,
	"day" date NOT NULL,
	"bytes_in" bigint DEFAULT 0 NOT NULL,
	"bytes_out" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_sync_usage" PRIMARY KEY("license_id","day")
);
--> statement-breakpoint
ALTER TABLE "license_activations" ADD COLUMN "device_sign_pk" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "sync_epoch" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_expired" ADD CONSTRAINT "sync_expired_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_frames" ADD CONSTRAINT "sync_frames_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_frames" ADD CONSTRAINT "sync_frames_sender_device_id_devices_id_fk" FOREIGN KEY ("sender_device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_pending" ADD CONSTRAINT "sync_pending_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_pending" ADD CONSTRAINT "sync_pending_frame_id_sync_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."sync_frames"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_usage" ADD CONSTRAINT "sync_usage_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sync_frames_license" ON "sync_frames" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "idx_sync_frames_created" ON "sync_frames" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_pending_frame" ON "sync_pending" USING btree ("frame_id");