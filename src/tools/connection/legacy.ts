import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectionAction } from "../../types/connection.js";
import {
	enforceRateLimit,
	handleAutoConnection,
	handleGetConnection,
	handleListBranches,
	handleListCredentials,
	handleListInstances,
	handleSetConnection,
	handleSwitchBranch,
	createConnectionError,
	getConnectionOutputSchema,
	type ToolResult,
} from "./common.js";

const TOOL_NAME = "connection";

const inputSchema = {
	action: z
		.enum([
			"auto",
			"set",
			"get",
			"listInstances",
			"listCredentials",
			"listBranches",
			"switchBranch",
		])
		.optional(),
	instance: z.string().optional(),
	branch: z.string().optional(),
};

const legacyHandler = async (args: Record<string, unknown>): Promise<ToolResult> => {
	enforceRateLimit(TOOL_NAME);
	const action = (args.action as string | undefined) ?? "auto";
	try {
		switch (action) {
			case "get":
				return handleGetConnection();
			case "listInstances":
				return handleListInstances();
			case "listCredentials":
				return handleListCredentials();
			case "listBranches":
				return handleListBranches(args.instance as string | undefined);
			case "switchBranch":
				return handleSwitchBranch({
					instance: args.instance as string | undefined,
					branch: args.branch as string | undefined,
					confirmed: true,
				});
			case "set":
				return handleSetConnection({
					instance: args.instance as string | undefined,
					branch: args.branch as string | undefined,
				});
			default:
				return handleAutoConnection();
		}
	} catch (error: unknown) {
		return createConnectionError(
			action as ConnectionAction,
			"Connection tool error",
			[error instanceof Error ? error.message : String(error)],
			"LEGACY_UNHANDLED_ERROR",
		);
	}
};

export function registerLegacyConnection(server: McpServer) {
	server.registerTool(
		TOOL_NAME,
		{
			title:
				"Connection (Auto, Set, Get, List Instances/Credentials/Branches, Switch)",
			description:
				"Legacy consolidated connection management. Prefer the intent-level tools (`connection.auto`, `connection.get`, etc.).",
			inputSchema,
			outputSchema: getConnectionOutputSchema(),
		},
		legacyHandler as unknown as Parameters<McpServer["registerTool"]>[2],
	);
}
