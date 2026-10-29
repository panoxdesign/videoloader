ALTER TABLE `queue_entries` ADD `file_title` text;--> statement-breakpoint
ALTER TABLE `queue_entries` ADD `file_media_id` text;--> statement-breakpoint
ALTER TABLE `queue_entries` ADD `file_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `queue_entries_file_name_idx` ON `queue_entries` (`file_name`) WHERE "queue_entries"."state" in ('running', 'done');