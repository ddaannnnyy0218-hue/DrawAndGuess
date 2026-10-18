CREATE TABLE `draw_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`round_id` text NOT NULL,
	`client_key` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `draw_events_room_round` ON `draw_events` (`code`,`round_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `draw_events_dedupe` ON `draw_events` (`code`,`round_id`,`client_key`);--> statement-breakpoint
CREATE TABLE `game_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
