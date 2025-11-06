import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	enforceRateLimit,
	getConnectionOutputSchema,
	handleGetConnection,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.get";

export function registerConnectionGet(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "Get Default Connection",
			description:
				"Retrieve the currently configured default instance and branch. Use this before running queries if you need to confirm the active connection.",
			inputSchema: {},
			outputSchema: getConnectionOutputSchema(),
		},
		async (): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleGetConnection() as ToolResult;
		},
	);
}
