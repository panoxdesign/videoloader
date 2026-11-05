CREATE TABLE `queue_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer NOT NULL,
	CONSTRAINT "queue_state_single_row_check" CHECK("queue_state"."id" = 1)
);
