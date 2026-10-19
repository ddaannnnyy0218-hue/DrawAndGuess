CREATE TABLE `challenge_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`solved` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `challenge_attempts_board` ON `challenge_attempts` (`challenge_id`,`solved`,`score`);--> statement-breakpoint
CREATE TABLE `drawing_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`level_id` integer NOT NULL,
	`creator` text NOT NULL,
	`drawing` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
