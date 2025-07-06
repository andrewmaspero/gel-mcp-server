import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { updateSchemaWatcher } from "../http.js";
import { getDefaultConnection, setDefaultConnection } from "../session.js";

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
			setDefaultConnection(args.instance, args.branch);
			const currentDefaults = getDefaultConnection();

			// Update the schema watcher for the new connection
			updateSchemaWatcher();

			return {
				content: [
					{
						type: "text",
						text: `Default connection updated. Current defaults: ${JSON.stringify(currentDefaults)}`,
					},
				],
			};
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
			return {
				content: [
					{
						type: "text",
						text: `Current default connection: ${JSON.stringify(currentDefaults)}`,
					},
				],
			};
		},
	);
}
