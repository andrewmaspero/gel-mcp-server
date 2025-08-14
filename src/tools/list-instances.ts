import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAvailableInstances } from "../database.js";
import { buildToolResponse } from "../utils.js";

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
					return buildToolResponse({
						status: "warn",
						title: "No instances found",
						textSections: [
							"Create 'instance_credentials' and add JSON credential files (e.g., mydb.json) to define instances.",
						],
					});
				}

				return buildToolResponse({
					status: "success",
					title: `Found ${instances.length} instance(s)`,
					jsonData: instances,
				});
			} catch (error: unknown) {
				return buildToolResponse({
					status: "error",
					title: "Error listing instances",
					textSections: [
						error instanceof Error ? error.message : String(error),
					],
				});
			}
		},
	);
}
