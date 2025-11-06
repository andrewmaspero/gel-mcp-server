import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	enforceRateLimit,
	handleAutoConnection,
	getConnectionOutputSchema,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.auto";

export function registerConnectionAuto(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "Auto Connection (Initialize Defaults)",
			description:
				"Use when no default connection is set. Preconditions: at least one credential file exists under `instance_credentials/`. Automatically selects an instance and branch, then returns the updated defaults.",
			inputSchema: {},
			outputSchema: getConnectionOutputSchema(),
		},
		async (): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleAutoConnection() as ToolResult;
		},
	);
}
