ALTER TABLE `daily_returns` ADD `weight` real;--> statement-breakpoint
ALTER TABLE `daily_returns` ADD `flow_rate` real DEFAULT 0 NOT NULL;