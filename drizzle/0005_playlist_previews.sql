CREATE TABLE `playlist_previews` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`data` text NOT NULL
);
