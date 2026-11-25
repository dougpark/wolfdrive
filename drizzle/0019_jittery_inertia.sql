CREATE TABLE `directory_tags` (
	`directory_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`directory_id`) REFERENCES `media_directories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `directory_tags_directory_tag_idx` ON `directory_tags` (`directory_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `directory_tags_tag_id_idx` ON `directory_tags` (`tag_id`);--> statement-breakpoint
ALTER TABLE `media_files` ADD `ai_summary` text;--> statement-breakpoint
ALTER TABLE `media_files` ADD `ai_tags` text;--> statement-breakpoint
ALTER TABLE `media_files` ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE `media_files` ADD `ai_indexed_mtime_ms` integer;