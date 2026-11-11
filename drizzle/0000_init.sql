CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`counted` integer DEFAULT true NOT NULL,
	`connected` integer DEFAULT true NOT NULL,
	`last_synced_on` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`user_id` text NOT NULL,
	`badge_key` text NOT NULL,
	`quarter` text NOT NULL,
	`earned_on` text NOT NULL,
	PRIMARY KEY(`user_id`, `badge_key`, `quarter`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` real NOT NULL,
	PRIMARY KEY(`account_id`, `date`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_returns` (
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`daily_return` real NOT NULL,
	`partial` integer DEFAULT false NOT NULL,
	`weight` real,
	`flow_rate` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `date`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `league_members` (
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_on` text NOT NULL,
	PRIMARY KEY(`league_id`, `user_id`),
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`owner_id` text,
	`created_on` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leagues_invite_code_unique` ON `leagues` (`invite_code`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`return_to` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quarter_snapshots` (
	`user_id` text NOT NULL,
	`quarter` text NOT NULL,
	`facts` text NOT NULL,
	PRIMARY KEY(`user_id`, `quarter`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_facts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`facts` text NOT NULL,
	`quarter` text NOT NULL,
	`start_prices` text NOT NULL,
	`first_seen` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`show_return` integer DEFAULT true NOT NULL,
	`show_badges` integer DEFAULT true NOT NULL,
	`show_holdings` integer DEFAULT false NOT NULL,
	`paused_since` text,
	`last_synced_at` integer,
	`sync_claimed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
