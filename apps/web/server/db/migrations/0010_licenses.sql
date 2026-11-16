CREATE TABLE "license_activations" (
	"license_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_license_activations" PRIMARY KEY("license_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"order_ref" text NOT NULL,
	"edition" text DEFAULT 'standard' NOT NULL,
	"max_activations" integer DEFAULT 5 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_licenses_order_ref" ON "licenses" USING btree ("order_ref");--> statement-breakpoint
CREATE INDEX "idx_licenses_email" ON "licenses" USING btree ("email");