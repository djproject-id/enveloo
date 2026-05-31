CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text DEFAULT 'attachment' NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`from_address` text DEFAULT '' NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`to_address` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`unread` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
