CREATE TABLE `ranked_memory` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`words` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL
);
