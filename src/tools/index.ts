import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnection } from "./connection.js";
import { registerDocs } from "./docs.js";
import { registerPrompts } from "./prompts.js";
import { registerQuery } from "./query.js";
import { registerSchema } from "./schema.js";

export function registerAllTools(server: McpServer) {
	// Consolidated tools
	registerConnection(server);
	registerSchema(server);
	registerQuery(server);
	registerDocs(server);
	registerPrompts(server);

	// Advertise capabilities for clients that inspect during initialize
	// Note: McpServer will expose these automatically based on handlers,
	// but explicitly initializing reduces ambiguity in some clients.
}
