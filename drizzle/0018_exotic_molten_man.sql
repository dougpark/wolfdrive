CREATE TABLE `status_events` (
	`key` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`event_id` text NOT NULL,
	`run_id` text,
	`sequence` integer,
	`type` text NOT NULL,
	`received_at` integer NOT NULL,
	`occurred_at` integer,
	`clock_skew_ms` integer,
	`payload_hash` text NOT NULL,
	`payload` text,
	FOREIGN KEY (`job_id`) REFERENCES `status_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_events_job_event_idx` ON `status_events` (`job_id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `status_events_run_sequence_idx` ON `status_events` (`job_id`,`run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `status_events_job_received_idx` ON `status_events` (`job_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `status_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`tags` text NOT NULL,
	`mode` text NOT NULL,
	`interval_seconds` integer,
	`anchor_at` integer,
	`grace_seconds` integer DEFAULT 300 NOT NULL,
	`max_runtime_seconds` integer,
	`heartbeat_seconds` integer,
	`paused` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`last_service_heartbeat_at` integer,
	`service_health` text,
	`schedule_epoch` integer DEFAULT 0 NOT NULL,
	`retired_matches` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `status_jobs_archived_idx` ON `status_jobs` (`archived`);--> statement-breakpoint
CREATE TABLE `status_runs` (
	`key` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`job_id` text NOT NULL,
	`first_received_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`last_heartbeat_at` integer,
	`source` text,
	`outcome` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`raw_status` text,
	`last_sequence` integer DEFAULT -1 NOT NULL,
	`terminal_sequence` integer,
	`start_sequence` integer,
	`schedule_epoch` integer NOT NULL,
	`schedule_index` integer,
	`message` text,
	`progress` text,
	`metrics` text,
	FOREIGN KEY (`job_id`) REFERENCES `status_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_runs_job_run_idx` ON `status_runs` (`job_id`,`id`);--> statement-breakpoint
CREATE INDEX `status_runs_job_start_idx` ON `status_runs` (`job_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `status_runs_schedule_idx` ON `status_runs` (`job_id`,`schedule_epoch`,`schedule_index`);