import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	enforceRateLimit,
	handleSetConnection,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.set";

const inputSchema = {
	instance: z
		.string()
		.describe("Optional. Provide to pick a specific credential file; otherwise the first available instance is used."),
	branch: z
		.string()
		.describe("Optional. Provide to set a specific branch; defaults to `main`."),
};

export function registerConnectionSet(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "Set Default Connection",
			description:
				"Update the session defaults to the provided instance and branch. Preconditions: credential file must exist; branches must already exist on the instance.",
			inputSchema,
		},
		async (args): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleSetConnection({
				instance: args.instance,
				branch: args.branch,
			}) as ToolResult;
		},
	);
}
