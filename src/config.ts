import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { findProjectRoot } from "./database.js";

// Bootstrap logger to avoid circular dependency: config -> logger -> config
const logger = {
	info: (message: string, meta?: Record<string, unknown>) =>
		console.log(
			`[config] INFO: ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`,
		),
	warn: (message: string, meta?: Record<string, unknown>) =>
		console.warn(
			`[config] WARN: ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`,
		),
	error: (message: string, meta?: Record<string, unknown>) =>
		console.error(
			`[config] ERROR: ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`,
		),
};

// Configuration schema
const ConfigSchema = z.object({
	// Server settings
	server: z
		.object({
			port: z.number().default(3000),
			host: z.string().default("localhost"),
			timeout: z.number().default(30000),
		})
		.default(() => ({
			port: 3000,
			host: "localhost",
			timeout: 30000,
		})),

	// Database settings
	database: z
		.object({
			defaultInstance: z.string().optional(),
			defaultBranch: z.string().default("main"),
			connectionTimeout: z.number().default(10000),
			queryTimeout: z.number().default(30000),
		})
		.default(() => ({
			defaultBranch: "main",
			connectionTimeout: 10000,
			queryTimeout: 30000,
		})),

	// Schema watcher settings
	schemaWatcher: z
		.object({
			enabled: z.boolean().default(true),
			maxRetries: z.number().default(3),
			retryDelay: z.number().default(5000),
			watchTimeout: z.number().default(60000),
		})
		.default(() => ({
			enabled: true,
			maxRetries: 3,
			retryDelay: 5000,
			watchTimeout: 60000,
		})),

	// Security settings
	security: z
		.object({
			executeTypescript: z
				.object({
					enabled: z.boolean().default(true),
					timeout: z.number().default(30000),
					memoryLimit: z.number().default(128), // MB
					maxCodeLength: z.number().default(10000),
					allowedModules: z.array(z.string()).default([]),
					blockedPatterns: z
						.array(z.string())
						.default([
							"require\\s*\\(.*fs.*\\)",
							"require\\s*\\(.*child_process.*\\)",
							"require\\s*\\(.*net.*\\)",
							"require\\s*\\(.*http.*\\)",
							"process\\.",
							"global\\.",
							"__dirname",
							"__filename",
						]),
				})
				.default(() => ({
					enabled: true,
					timeout: 30000,
					memoryLimit: 128,
					maxCodeLength: 10000,
					allowedModules: [],
					blockedPatterns: [
						"require\\s*\\(.*fs.*\\)",
						"require\\s*\\(.*child_process.*\\)",
						"require\\s*\\(.*net.*\\)",
						"require\\s*\\(.*http.*\\)",
						"process\\.",
						"global\\.",
						"__dirname",
						"__filename",
					],
				})),
			rateLimit: z
				.object({
					enabled: z.boolean().default(true),
					windowMs: z.number().default(60000), // 1 minute
					maxRequests: z.number().default(100),
					executeToolsLimit: z.number().default(10),
				})
				.default(() => ({
					enabled: true,
					windowMs: 60000,
					maxRequests: 100,
					executeToolsLimit: 10,
				})),
		})
		.default(() => ({
			executeTypescript: {
				enabled: true,
				timeout: 30000,
				memoryLimit: 128,
				maxCodeLength: 10000,
				allowedModules: [],
				blockedPatterns: [
					"require\\s*\\(.*fs.*\\)",
					"require\\s*\\(.*child_process.*\\)",
					"require\\s*\\(.*net.*\\)",
					"require\\s*\\(.*http.*\\)",
					"process\\.",
					"global\\.",
					"__dirname",
					"__filename",
				],
			},
			rateLimit: {
				enabled: true,
				windowMs: 60000,
				maxRequests: 100,
				executeToolsLimit: 10,
			},
		})),

	// Logging settings
	logging: z
		.object({
			level: z.enum(["error", "warn", "info", "debug"]).default("info"),
			maxFiles: z.number().default(5),
			maxSize: z.number().default(5242880), // 5MB
			enableConsole: z.boolean().default(true),
		})
		.default(() => ({
			level: "info" as const,
			maxFiles: 5,
			maxSize: 5242880,
			enableConsole: true,
		})),

	// Tool settings
	tools: z
		.object({
			validation: z
				.object({
					strictMode: z.boolean().default(true),
					maxQueryLength: z.number().default(50000),
					allowedSchemaPatterns: z
						.array(z.string())
						.default(["^[a-zA-Z_][a-zA-Z0-9_]*$"]),
				})
				.default(() => ({
					strictMode: true,
					maxQueryLength: 50000,
					allowedSchemaPatterns: ["^[a-zA-Z_][a-zA-Z0-9_]*$"],
				})),
		})
		.default(() => ({
			validation: {
				strictMode: true,
				maxQueryLength: 50000,
				allowedSchemaPatterns: ["^[a-zA-Z_][a-zA-Z0-9_]*$"],
			},
		})),
});

export type Config = z.infer<typeof ConfigSchema>;

let config: Config | null = null;

/**
 * Load configuration from file or environment variables
 */
export function loadConfig(): Config {
	if (config) {
		return config;
	}

	const projectRoot = findProjectRoot();
	const configPath = path.join(projectRoot, "gel-mcp-config.json");

	let fileConfig = {};

	// Try to load from file
	if (fs.existsSync(configPath)) {
		try {
			const configContent = fs.readFileSync(configPath, "utf-8");
			fileConfig = JSON.parse(configContent);
			logger.info("Configuration loaded from file", { configPath });
		} catch (error) {
			logger.warn("Failed to load configuration file, using defaults", {
				error: error instanceof Error ? error.message : String(error),
				configPath,
			});
		}
	}

	// Merge with environment variables
	const parseBool = (val: string | undefined): boolean | undefined => {
		if (val === undefined) return undefined;
		const v = val.toLowerCase();
		if (v === "true" || v === "1") return true;
		if (v === "false" || v === "0") return false;
		return undefined;
	};

	const envConfig = {
		server: {
			port: process.env.GEL_MCP_PORT
				? parseInt(process.env.GEL_MCP_PORT, 10)
				: undefined,
			host: process.env.GEL_MCP_HOST,
			timeout: process.env.GEL_MCP_TIMEOUT
				? parseInt(process.env.GEL_MCP_TIMEOUT, 10)
				: undefined,
		},
		database: {
			defaultInstance: process.env.GEL_DEFAULT_INSTANCE,
			defaultBranch: process.env.GEL_DEFAULT_BRANCH,
			connectionTimeout: process.env.GEL_CONNECTION_TIMEOUT
				? parseInt(process.env.GEL_CONNECTION_TIMEOUT, 10)
				: undefined,
			queryTimeout: process.env.GEL_QUERY_TIMEOUT
				? parseInt(process.env.GEL_QUERY_TIMEOUT, 10)
				: undefined,
		},
		schemaWatcher: {
			enabled: parseBool(process.env.GEL_SCHEMA_WATCHER_ENABLED),
			maxRetries: process.env.GEL_SCHEMA_WATCHER_MAX_RETRIES
				? parseInt(process.env.GEL_SCHEMA_WATCHER_MAX_RETRIES, 10)
				: undefined,
			retryDelay: process.env.GEL_SCHEMA_WATCHER_RETRY_DELAY
				? parseInt(process.env.GEL_SCHEMA_WATCHER_RETRY_DELAY, 10)
				: undefined,
		},
		security: {
			executeTypescript: {
				enabled: parseBool(process.env.GEL_EXECUTE_TYPESCRIPT_ENABLED),
				timeout: process.env.GEL_EXECUTE_TYPESCRIPT_TIMEOUT
					? parseInt(process.env.GEL_EXECUTE_TYPESCRIPT_TIMEOUT, 10)
					: undefined,
				memoryLimit: process.env.GEL_EXECUTE_TYPESCRIPT_MEMORY_LIMIT
					? parseInt(process.env.GEL_EXECUTE_TYPESCRIPT_MEMORY_LIMIT, 10)
					: undefined,
			},
			rateLimit: {
				enabled: parseBool(process.env.GEL_RATE_LIMIT_ENABLED),
				maxRequests: process.env.GEL_RATE_LIMIT_MAX_REQUESTS
					? parseInt(process.env.GEL_RATE_LIMIT_MAX_REQUESTS, 10)
					: undefined,
				executeToolsLimit: process.env.GEL_RATE_LIMIT_EXECUTE_TOOLS
					? parseInt(process.env.GEL_RATE_LIMIT_EXECUTE_TOOLS, 10)
					: undefined,
			},
		},
		logging: {
			level: process.env.LOG_LEVEL as
				| "error"
				| "warn"
				| "info"
				| "debug"
				| undefined,
			enableConsole:
				parseBool(process.env.GEL_LOG_CONSOLE) ??
				(process.env.NODE_ENV === "production" ? false : undefined),
		},
	};

	// Remove undefined values
	const cleanEnvConfig = JSON.parse(JSON.stringify(envConfig));

	// Merge configurations: defaults < file < environment
	const mergedConfig = {
		...fileConfig,
		...cleanEnvConfig,
	};

	try {
		config = ConfigSchema.parse(mergedConfig);
		logger.info("Configuration loaded successfully", {
			hasFileConfig: Object.keys(fileConfig).length > 0,
			hasEnvConfig: Object.keys(cleanEnvConfig).length > 0,
		});
		return config;
	} catch (error) {
		logger.error("Configuration validation failed, using defaults", {
			error: error instanceof Error ? error.message : String(error),
		});
		config = ConfigSchema.parse({});
		return config;
	}
}

/**
 * Get current configuration
 */
export function getConfig(): Config {
	return config || loadConfig();
}

/**
 * Create a sample configuration file
 */
export function createSampleConfig(): void {
	const projectRoot = findProjectRoot();
	const configPath = path.join(projectRoot, "gel-mcp-config.json.example");

	const sampleConfig = {
		server: {
			port: 3000,
			host: "localhost",
			timeout: 30000,
		},
		database: {
			defaultInstance: "your_instance_name",
			defaultBranch: "main",
			connectionTimeout: 10000,
			queryTimeout: 30000,
		},
		schemaWatcher: {
			enabled: true,
			maxRetries: 3,
			retryDelay: 5000,
			watchTimeout: 60000,
		},
		security: {
			executeTypescript: {
				enabled: true,
				timeout: 30000,
				memoryLimit: 128,
				maxCodeLength: 10000,
				allowedModules: [],
				blockedPatterns: [
					"require\\s*\\(.*fs.*\\)",
					"require\\s*\\(.*child_process.*\\)",
					"require\\s*\\(.*net.*\\)",
					"require\\s*\\(.*http.*\\)",
					"process\\.",
					"global\\.",
					"__dirname",
					"__filename",
				],
			},
			rateLimit: {
				enabled: true,
				windowMs: 60000,
				maxRequests: 100,
				executeToolsLimit: 10,
			},
		},
		logging: {
			level: "info",
			maxFiles: 5,
			maxSize: 5242880,
			enableConsole: true,
		},
		tools: {
			validation: {
				strictMode: true,
				maxQueryLength: 50000,
				allowedSchemaPatterns: ["^[a-zA-Z_][a-zA-Z0-9_]*$"],
			},
		},
	};

	fs.writeFileSync(configPath, JSON.stringify(sampleConfig, null, 2));
	logger.info("Sample configuration file created", { configPath });
}

/**
 * Reload configuration from file
 */
export function reloadConfig(): Config {
	config = null;
	return loadConfig();
}

// Load configuration on module import
loadConfig();
