import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	enforceRateLimit,
	handleSwitchBranch,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection.switch-branch";

const inputSchema = {
	instance: z
		.string()
		.optional()
		.describe("Optional. Override the session instance when switching branches."),
	branch: z
		.string()
		.describe("Required. Branch name to switch the connection to."),
};

export function registerConnectionSwitchBranch(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title: "Switch Branch",
			description:
				"Switch the active branch for the current or provided instance using `gel branch switch`. Requires prior credentials setup.",
			inputSchema,
		},
		async (args): Promise<ToolResult> => {
			enforceRateLimit(TOOL_NAME);
			return handleSwitchBranch({
				instance: args.instance,
				branch: args.branch,
			}) as ToolResult;
		},
	);
}
