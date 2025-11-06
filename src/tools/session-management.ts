import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getConnectionOutputSchema,
	handleGetConnection,
	handleSetConnection,
	type ToolResult,
} from "./connection/common.js";

export function registerSessionManagement(server: McpServer) {
	server.registerTool(
		"set-default-connection",
		{
			title: "Set Default Connection",
			description:
				"Sets the default database instance and/or branch for the current session. Subsequent tool calls will use these defaults if not explicitly provided.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
			outputSchema: getConnectionOutputSchema(),
		},
		async (args): Promise<ToolResult> => {
			return handleSetConnection({
				instance: args.instance,
				branch: args.branch,
			});
		},
	);

	server.registerTool(
		"get-default-connection",
		{
			title: "Get Default Connection",
			description:
				"Retrieves the currently configured default database instance and branch for the session.",
			inputSchema: {},
			outputSchema: getConnectionOutputSchema(),
		},
		async (): Promise<ToolResult> => {
			return handleGetConnection();
		},
	);
}
