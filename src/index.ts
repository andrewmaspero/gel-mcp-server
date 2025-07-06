import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";

const logger = createLogger("main");

export async function main() {
	const server = createApp();

	const transport = new StdioServerTransport();
	logger.info("Gel MCP Server running on stdio");

	process.on("SIGTERM", () => {
		logger.info("Shutting down server...");
		transport.close();
		process.exit(0);
	});

	process.on("SIGINT", () => {
		logger.info("Shutting down server...");
		transport.close();
		process.exit(0);
	});

	await server.connect(transport);
}

main().catch((err) => {
	logger.error("Fatal error in main():", err);
	process.exit(1);
});
