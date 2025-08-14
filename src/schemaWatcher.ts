import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { getConfig } from "./config.js";
import { findProjectRoot } from "./database.js";
import { createLogger } from "./logger.js";
import { getDefaultConnection } from "./session.js";

const logger = createLogger("schema-watcher");
const config = getConfig();

let currentWatcher: ChildProcess | null = null;
let currentWatchedConnection: { instance?: string; branch?: string } | null =
	null;
let watcherRetryCount = 0;

export function stopSchemaWatcher() {
	if (currentWatcher) {
		logger.info("Stopping current schema watcher");
		currentWatcher.kill();
		currentWatcher = null;
		currentWatchedConnection = null;
	}
}

export function startSchemaWatcher(instance?: string, branch?: string) {
	// Stop any existing watcher
	stopSchemaWatcher();

	// Check if schema watcher is enabled
	if (!config.schemaWatcher.enabled) {
		logger.info("Schema watcher is disabled in configuration");
		return;
	}

	// Don't start watcher if no instance is set
	if (!instance) {
		logger.info("No instance specified, not starting schema watcher");
		return;
	}

	logger.info("Starting schema watcher", {
		instance,
		branch,
		retryCount: watcherRetryCount,
	});

	try {
		const projectRoot = findProjectRoot();
		const args = ["--watch"] as string[];

		if (instance) {
			args.push("--instance", instance);
		}
		if (branch) {
			args.push("--branch", branch);
		}

		currentWatcher = spawn("npx", ["gel", ...args], {
			cwd: projectRoot,
			stdio: ["ignore", "pipe", "pipe"],
		});

		currentWatchedConnection = { instance, branch };

		currentWatcher.stdout?.on("data", (data) => {
			logger.info("Schema watcher output", { output: data.toString().trim() });
		});

		currentWatcher.stderr?.on("data", (data) => {
			logger.error("Schema watcher error", { error: data.toString().trim() });
		});

		currentWatcher.on("close", (code) => {
			logger.info("Schema watcher process closed", { code });

			// Reset the watcher reference
			currentWatcher = null;
			currentWatchedConnection = null;

			// Retry if it wasn't a clean shutdown and we haven't exceeded retry limit
			if (code !== 0 && watcherRetryCount < config.schemaWatcher.maxRetries) {
				watcherRetryCount++;
				logger.warn("Schema watcher crashed, retrying...", {
					code,
					retryCount: watcherRetryCount,
					maxRetries: config.schemaWatcher.maxRetries,
				});

				setTimeout(() => {
					startSchemaWatcher(instance, branch);
				}, config.schemaWatcher.retryDelay);
			} else if (code !== 0) {
				logger.error("Schema watcher failed after maximum retries", {
					code,
					retryCount: watcherRetryCount,
				});
				watcherRetryCount = 0; // Reset for next connection change
			} else {
				// Clean shutdown, reset retry count
				watcherRetryCount = 0;
			}
		});

		currentWatcher.on("error", (error) => {
			logger.error("Schema watcher process error", { error: error.message });
		});

		// Reset retry count on successful start
		watcherRetryCount = 0;
	} catch (error) {
		logger.error("Failed to start schema watcher", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export function updateSchemaWatcher() {
	const connection = getDefaultConnection();

	// Check if we need to update the watcher
	const needsUpdate =
		!currentWatchedConnection ||
		currentWatchedConnection.instance !== connection.defaultInstance ||
		currentWatchedConnection.branch !== connection.defaultBranch;

	if (needsUpdate) {
		logger.info("Connection changed, updating schema watcher", {
			current: currentWatchedConnection,
			new: connection,
		});

		startSchemaWatcher(connection.defaultInstance, connection.defaultBranch);
	}
}

export function getSchemaWatcherStatus() {
	return {
		status: currentWatcher ? "running" : "stopped",
		currentConnection: currentWatchedConnection,
		retryCount: watcherRetryCount,
	};
}
