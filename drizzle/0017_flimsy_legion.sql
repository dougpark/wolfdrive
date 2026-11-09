CREATE TABLE `research_deed_lookups` (
	`address_id` text PRIMARY KEY NOT NULL,
	`parcel_id` text NOT NULL,
	`source_id` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`deed_count` integer NOT NULL,
	FOREIGN KEY (`address_id`) REFERENCES `research_addresses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `research_deeds` (
	`id` text PRIMARY KEY NOT NULL,
	`address_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_deed_id` text NOT NULL,
	`parcel_id` text NOT NULL,
	`deed_date` text,
	`raw_deed_date` text,
	`deed_type` text,
	`description` text,
	`grantor` text,
	`grantee` text,
	`book` text,
	`volume` text,
	`page` text,
	`instrument_number` text,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`address_id`) REFERENCES `research_addresses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_deeds_address_source_deed_idx` ON `research_deeds` (`address_id`,`source_deed_id`);--> statement-breakpoint
CREATE INDEX `research_deeds_grantee_idx` ON `research_deeds` (`grantee`);--> statement-breakpoint
CREATE INDEX `research_deeds_grantor_idx` ON `research_deeds` (`grantor`);