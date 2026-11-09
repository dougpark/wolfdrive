ALTER TABLE `research_addresses` ADD `actual_year_built` integer;--> statement-breakpoint
ALTER TABLE `research_addresses` ADD `year_built_source_id` text REFERENCES research_sources(id);