CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`directory_id` text NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`relative_path` text NOT NULL,
	`filename` text NOT NULL,
	`extension` text NOT NULL,
	`mime_type` text,
	`media_category` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`indexed_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`directory_id`) REFERENCES `media_directories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_path_unique` ON `media_files` (`path`);