import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	enforceRateLimit,
	handleAutoConnection,
	handleGetConnection,
	handleListBranches,
	handleListCredentials,
	handleListInstances,
	handleSetConnection,
	handleSwitchBranch,
	type ToolResult,
} from "./common.js";
import { buildToolResponse } from "../../utils.js";

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
		return (buildToolResponse({
			status: "error",
			title: "Connection tool error",
			textSections: [
				error instanceof Error ? error.message : String(error),
			],
		}) as unknown) as ToolResult;
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
		},
		legacyHandler as unknown as Parameters<McpServer["registerTool"]>[2],
	);
}
