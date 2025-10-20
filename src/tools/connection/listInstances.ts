import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	enforceRateLimit,
	handleListInstances,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.list-instances";

export function registerConnectionListInstances(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "List Available Instances",
			description:
				"Enumerate credential files discovered under `instance_credentials/`. Use before setting defaults or switching branches.",
			inputSchema: {},
		},
		async (): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleListInstances() as ToolResult;
		},
	);
}
