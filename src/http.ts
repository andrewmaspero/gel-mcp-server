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
import { closeAllConnections, initGelClient } from "./database.js";
import { createLogger } from "./logger.js";
import {
	getSchemaWatcherStatus,
	startSchemaWatcher,
	stopSchemaWatcher,
} from "./schemaWatcher.js";
import { getDefaultConnection } from "./session.js";

const logger = createLogger("http");
const config = getConfig();

// Schema watcher lifecycle handled in schemaWatcher.ts

export function registerHttpRoutes(fastify: FastifyInstance) {
	fastify.get(
		"/health",
		async (_request: FastifyRequest, _reply: FastifyReply) => {
			const connection = getDefaultConnection();
			const watcher = getSchemaWatcherStatus();
			return {
				status: "ok",
				timestamp: new Date().toISOString(),
				connection: {
					defaultInstance: connection.defaultInstance || null,
					defaultBranch: connection.defaultBranch || null,
				},
				schemaWatcher: watcher,
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
process.on("exit", stopSchemaWatcher);
process.on("SIGINT", stopSchemaWatcher);
process.on("SIGTERM", stopSchemaWatcher);

async function main() {
	const server = fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

	// Add schema validator and serializer
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	const mcpServer = createApp();

	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: randomUUID,
		// Enable protection when running HTTP server to reduce DNS rebinding risks
		// Note: adjust hosts/origins as needed for your deployment
		enableDnsRebindingProtection: true,
		allowedHosts: ["127.0.0.1", "localhost"],
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
