import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	enforceRateLimit,
	getConnectionOutputSchema,
	handleListCredentials,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.list-credentials";

export function registerConnectionListCredentials(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "List Credential Files",
			description:
				"Show the credential files available for connections. Use this to confirm instances are configured before calling `connection.set`.",
			inputSchema: {},
			outputSchema: getConnectionOutputSchema(),
		},
		async (): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleListCredentials() as ToolResult;
		},
	);
}
