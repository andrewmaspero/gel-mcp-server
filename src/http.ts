import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastify from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import {
	closeAllConnections,
	findProjectRoot,
	initGelClient,
} from "./database.js";
import { createLogger } from "./logger.js";
import { getDefaultConnection } from "./session.js";

const logger = createLogger("http");
const config = getConfig();

// Track current watcher process and connection
let currentWatcher: ChildProcess | null = null;
let currentWatchedConnection: { instance?: string; branch?: string } | null =
	null;
let watcherRetryCount = 0;

function stopCurrentWatcher() {
	if (currentWatcher) {
		logger.info("Stopping current schema watcher");
		currentWatcher.kill();
		currentWatcher = null;
		currentWatchedConnection = null;
	}
}

function startSchemaWatcher(instance?: string, branch?: string) {
	// Stop any existing watcher
	stopCurrentWatcher();

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
		const args = ["--watch"];

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

export function registerHttpRoutes(fastify: FastifyInstance) {
	fastify.get(
		"/health",
		async (_request: FastifyRequest, _reply: FastifyReply) => {
			const connection = getDefaultConnection();
			const watcherStatus = currentWatcher ? "running" : "stopped";

			return {
				status: "ok",
				timestamp: new Date().toISOString(),
				connection: {
					defaultInstance: connection.defaultInstance || null,
					defaultBranch: connection.defaultBranch || null,
				},
				schemaWatcher: {
					status: watcherStatus,
					currentConnection: currentWatchedConnection,
					retryCount: watcherRetryCount,
				},
			};
		},
	);

	// Start initial watcher based on current connection
	const initialConnection = getDefaultConnection();
	if (initialConnection.defaultInstance) {
		startSchemaWatcher(
			initialConnection.defaultInstance,
			initialConnection.defaultBranch,
		);
	}
}

// Cleanup on process exit
process.on("exit", stopCurrentWatcher);
process.on("SIGINT", stopCurrentWatcher);
process.on("SIGTERM", stopCurrentWatcher);

async function main() {
	const server = fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

	// Add schema validator and serializer
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	const mcpServer = createApp();

	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: randomUUID,
	});
	await mcpServer.connect(transport);

	const mcpRequestSchema = z.object({
		jsonrpc: z.literal("2.0"),
		method: z.string(),
		params: z.any().optional(),
		id: z.union([z.string(), z.number(), z.null()]).optional(),
	});

	const handleMcpRequest = async (req: FastifyRequest, reply: FastifyReply) => {
		try {
			await transport.handleRequest(req.raw, reply.raw, req.body);
		} catch (err) {
			logger.error("Error handling MCP request", {
				error: err instanceof Error ? err.message : String(err),
			});
			if (!reply.sent) {
				reply.status(500).send({ error: "Internal Server Error" });
			}
		}
	};

	server.post("/mcp", { schema: { body: mcpRequestSchema } }, handleMcpRequest);
	server.get("/mcp", handleMcpRequest);
	server.delete("/mcp", handleMcpRequest);

	const port = config.server.port;

	server.addHook("onClose", async () => {
		logger.info("Shutting down server...");
		await closeAllConnections();
		await transport.close();
	});

	const gracefulShutdown = (signal: string) => {
		logger.info(`Received ${signal}, shutting down gracefully`);
		server.close(() => {
			logger.info("Server closed");
			process.exit(0);
		});
	};

	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
	process.on("SIGINT", () => gracefulShutdown("SIGINT"));

	try {
		await server.listen({ port, host: config.server.host });
		logger.info(`Server listening on ${config.server.host}:${port}`);
		await initGelClient();
	} catch (err) {
		logger.error("Failed to start server:", {
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
}

// Export main function for manual execution
export { main as startHttpServer };
