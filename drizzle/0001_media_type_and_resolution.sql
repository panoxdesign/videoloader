-- Vor Ticket 19 lud jeder Eintrag MP4 bis 1080p.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_queue_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`media_type` text NOT NULL,
	`resolution` text,
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
	CONSTRAINT "queue_entries_state_check" CHECK("__new_queue_entries"."state" in ('waiting', 'running', 'done', 'failed', 'cancelled')),
	CONSTRAINT "queue_entries_media_check" CHECK(("__new_queue_entries"."media_type" = 'video' and "__new_queue_entries"."resolution" is not null and "__new_queue_entries"."resolution" in ('best', '1080', '720', '480')) or ("__new_queue_entries"."media_type" = 'audio' and "__new_queue_entries"."resolution" is null))
);
--> statement-breakpoint
INSERT INTO `__new_queue_entries`("id", "url", "title", "media_type", "resolution", "state", "queued_at", "finished_at", "phase", "downloaded_bytes", "total_bytes", "total_bytes_estimate", "fragment_index", "fragment_count", "speed", "eta", "postprocessor", "pgid", "file_path", "error_category") SELECT "id", "url", "title", 'video', '1080', "state", "queued_at", "finished_at", "phase", "downloaded_bytes", "total_bytes", "total_bytes_estimate", "fragment_index", "fragment_count", "speed", "eta", "postprocessor", "pgid", "file_path", "error_category" FROM `queue_entries`;--> statement-breakpoint
DROP TABLE `queue_entries`;--> statement-breakpoint
ALTER TABLE `__new_queue_entries` RENAME TO `queue_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `queue_entries_state_queued_at_idx` ON `queue_entries` (`state`,`queued_at`);