CREATE TABLE `ranked_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ranked_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`avatar` integer NOT NULL,
	`rp` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ranked_queue` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`rating` integer NOT NULL,
	`queued_at` integer NOT NULL,
	`seen_at` integer NOT NULL,
	`match_id` text
);
--> statement-breakpoint
CREATE INDEX `ranked_queue_pool` ON `ranked_queue` (`match_id`,`rating`,`seen_at`);--> statement-breakpoint
CREATE TABLE `ranked_results` (
	`match_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`delta` integer NOT NULL,
	`won` integer NOT NULL,
	`lost` integer NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ranked_result_once` ON `ranked_results` (`match_id`,`profile_id`);