import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";
import { getConfig } from "./config.js";
import { setSamplingConfig } from "./sampling.js";

export function createApp(): McpServer {
	const server = new McpServer({
		name: "gel-mcp-server",
		version: "1.2.0",
	});

	const sampling = getConfig().sampling;
	setSamplingConfig(!!sampling.enabled, sampling.maxTokens);
	registerAllResources(server);
	registerAllTools(server);

	return server;
}
