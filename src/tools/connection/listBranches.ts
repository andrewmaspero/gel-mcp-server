import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	enforceRateLimit,
	handleListBranches,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.list-branches";

const inputSchema = {
	instance: z
		.string()
		.optional()
		.describe("Optional. Provide to inspect branches for a specific instance; defaults to the current session instance."),
};

export function registerConnectionListBranches(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "List Branches",
			description:
				"Retrieve the branches for an instance using `gel branch list`. Provide `instance` or rely on the current default connection.",
			inputSchema,
		},
		async (args): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleListBranches(args.instance) as ToolResult;
		},
	);
}
