CREATE TABLE `projects` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`due_date` text,
	`custom_metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_user_status_idx` ON `projects` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `projects_user_due_date_idx` ON `projects` (`user_id`,`due_date`);