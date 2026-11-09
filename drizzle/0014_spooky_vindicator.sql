CREATE TABLE `research_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`short_address` text NOT NULL,
	`imported_resident_1` text,
	`imported_resident_2` text,
	`import_source` text DEFAULT 'research_export.csv' NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_addresses_short_address_idx` ON `research_addresses` (`short_address`);--> statement-breakpoint
CREATE INDEX `research_addresses_address_idx` ON `research_addresses` (`address`);--> statement-breakpoint
CREATE TABLE `research_events` (
	`id` text PRIMARY KEY NOT NULL,
	`address_id` text NOT NULL,
	`source_id` text,
	`event_date` text,
	`event_type` text DEFAULT 'general' NOT NULL,
	`title` text,
	`summary` text,
	`excerpt` text,
	`raw_text` text,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`extraction_data` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`address_id`) REFERENCES `research_addresses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `research_events_address_idx` ON `research_events` (`address_id`);--> statement-breakpoint
CREATE INDEX `research_events_type_idx` ON `research_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `research_events_date_idx` ON `research_events` (`event_date`);--> statement-breakpoint
CREATE TABLE `research_property_owners` (
	`id` text PRIMARY KEY NOT NULL,
	`address_id` text NOT NULL,
	`source_id` text,
	`owner_name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`parcel_id` text,
	`deed_reference` text,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`address_id`) REFERENCES `research_addresses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `research_property_owners_address_idx` ON `research_property_owners` (`address_id`);--> statement-breakpoint
CREATE INDEX `research_property_owners_name_idx` ON `research_property_owners` (`owner_name`);--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`citation` text,
	`external_id` text,
	`retrieved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_sources_type_idx` ON `research_sources` (`source_type`);