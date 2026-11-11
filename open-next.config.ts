import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Holdfast pages are per-user and dynamic, so no incremental cache is needed.
export default defineCloudflareConfig({});
