CREATE TABLE `queue_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`state` text NOT NULL,
	`queued_at` integer NOT NULL,
	`finished_at` integer,
	`phase` text,
	`downloaded_bytes` integer,
	`total_bytes` integer,
	`total_bytes_estimate` integer,
	`fragment_index` integer,
	`fragment_count` integer,
	`speed` real,
	`eta` integer,
	`postprocessor` text,
	`pgid` integer,
	`file_path` text,
	`error_category` text,
	CONSTRAINT "queue_entries_state_check" CHECK("queue_entries"."state" in ('waiting', 'running', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `queue_entries_state_queued_at_idx` ON `queue_entries` (`state`,`queued_at`);