CREATE TABLE "alert_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
