ALTER TABLE "board_api_keys" ADD COLUMN IF NOT EXISTS "access_mode" text DEFAULT 'full' NOT NULL;
