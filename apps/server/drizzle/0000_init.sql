CREATE TABLE "accounts" (
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "accounts_provider_provider_user_id_pk" PRIMARY KEY("provider","provider_user_id"),
	CONSTRAINT "accounts_provider" CHECK ("accounts"."provider" IN ('google', 'github'))
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"white_id" uuid NOT NULL,
	"black_id" uuid NOT NULL,
	"minutes" smallint NOT NULL,
	"winner" char(1),
	"reason" text NOT NULL,
	"moves" text[] NOT NULL,
	"white_rating" integer NOT NULL,
	"black_rating" integer NOT NULL,
	"white_delta" smallint NOT NULL,
	"black_delta" smallint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_winner" CHECK ("games"."winner" IN ('w', 'b')),
	CONSTRAINT "games_reason" CHECK ("games"."reason" IN ('checkmate', 'timeout', 'resign', 'stalemate', 'insufficient', 'threefold', 'fifty', 'timeout-insufficient')),
	CONSTRAINT "games_two_players" CHECK ("games"."white_id" <> "games"."black_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(32) NOT NULL,
	"avatar_url" text,
	"rating" integer DEFAULT 1500 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_display_name_length" CHECK (char_length(btrim("users"."display_name")) BETWEEN 1 AND 32)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_id_users_id_fk" FOREIGN KEY ("white_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_id_users_id_fk" FOREIGN KEY ("black_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "games_white_history" ON "games" USING btree ("white_id","ended_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "games_black_history" ON "games" USING btree ("black_id","ended_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");