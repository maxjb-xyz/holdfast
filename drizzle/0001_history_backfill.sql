ALTER TABLE `accounts` ADD `history_checked_on` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `history_from` text;--> statement-breakpoint
ALTER TABLE `daily_returns` ADD `estimated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `leagues` ADD `start_on` text;