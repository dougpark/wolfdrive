CREATE INDEX `media_files_user_filename_idx` ON `media_files` (`user_id`,`filename`);--> statement-breakpoint
CREATE INDEX `media_files_user_extension_idx` ON `media_files` (`user_id`,`extension`);--> statement-breakpoint
CREATE INDEX `media_files_user_size_idx` ON `media_files` (`user_id`,`size_bytes`);--> statement-breakpoint
CREATE INDEX `media_files_user_category_filename_idx` ON `media_files` (`user_id`,`media_category`,`filename`);--> statement-breakpoint
CREATE INDEX `media_files_user_category_extension_idx` ON `media_files` (`user_id`,`media_category`,`extension`);--> statement-breakpoint
CREATE INDEX `media_files_user_category_size_idx` ON `media_files` (`user_id`,`media_category`,`size_bytes`);