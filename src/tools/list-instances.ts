import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAvailableInstances } from "../database.js";

export function registerListInstances(server: McpServer) {
	server.registerTool(
		"list-instances",
		{
			title: "List Instances",
			description:
				"Lists all configured database instances. Each instance represents a separate database connection defined by a credential file. You must specify an instance to connect to if you are not using the default.",
			inputSchema: {},
		},
		async () => {
			try {
				const instances = getAvailableInstances();

				if (instances.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No instance_credentials directory found or it is empty. Create 'instance_credentials' and add JSON credential files (e.g., mydb.json) to define instances.",
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `Found ${instances.length} instance(s): ${instances.join(", ")}`,
						},
					],
				};
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing instances: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
