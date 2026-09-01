CREATE INDEX `media_directories_user_id_idx` ON `media_directories` (`user_id`);--> statement-breakpoint
CREATE INDEX `media_files_user_mtime_idx` ON `media_files` (`user_id`,`mtime_ms`);--> statement-breakpoint
CREATE INDEX `media_files_user_category_mtime_idx` ON `media_files` (`user_id`,`media_category`,`mtime_ms`);--> statement-breakpoint
CREATE INDEX `media_files_user_directory_category_idx` ON `media_files` (`user_id`,`directory_id`,`media_category`);