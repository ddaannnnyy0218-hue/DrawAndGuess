CREATE TABLE `account_rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_rate_expiry` ON `account_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `friend_links` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `ranked_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `friend_links_creator_expiry` ON `friend_links` (`creator_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`first_id` text NOT NULL,
	`second_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`first_id`, `second_id`)
);
--> statement-breakpoint
CREATE INDEX `friendships_second` ON `friendships` (`second_id`);--> statement-breakpoint
CREATE TABLE `game_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`auto_play` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `ranked_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_accounts_profile_id_unique` ON `game_accounts` (`profile_id`);--> statement-breakpoint
CREATE TABLE `room_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`room_code` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_invitations_pair_room` ON `room_invitations` (`sender_id`,`recipient_id`,`room_code`);--> statement-breakpoint
CREATE INDEX `room_invitations_recipient_expiry` ON `room_invitations` (`recipient_id`,`expires_at`);