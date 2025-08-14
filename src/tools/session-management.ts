import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { emitConnectionChanged } from "../events.js";
import { updateSchemaWatcher } from "../schemaWatcher.js";
import { getDefaultConnection, setDefaultConnection } from "../session.js";
import { buildToolResponse, validateConnectionArgs } from "../utils.js";

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
		},
		async (args) => {
			// Validate optional inputs
			validateConnectionArgs(args);
			setDefaultConnection(args.instance, args.branch);
			const currentDefaults = getDefaultConnection();

			// Update the schema watcher for the new connection
			updateSchemaWatcher();
			emitConnectionChanged({
				instance: currentDefaults.defaultInstance,
				branch: currentDefaults.defaultBranch,
			});

			return buildToolResponse({
				status: "success",
				title: "Default connection updated",
				jsonData: currentDefaults,
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
		},
		async () => {
			const currentDefaults = getDefaultConnection();
			return buildToolResponse({
				status: "info",
				title: "Current default connection",
				jsonData: currentDefaults,
			});
		},
	);
}
