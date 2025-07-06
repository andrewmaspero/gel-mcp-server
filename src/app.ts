import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

export function createApp(): McpServer {
	const server = new McpServer({
		name: "gel-database",
		version: "1.2.0",
	});

	registerAllTools(server);

	return server;
}
