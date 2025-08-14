import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listInstances } from "../database.js";
import { buildToolResponse } from "../utils.js";

export function registerListCredentials(server: McpServer) {
	server.registerTool(
		"list-credentials",
		{
			title: "List Available Credential Files",
			description:
				"Lists all available instance credential files in the instance_credentials directory. Each credential file corresponds to a database instance you can connect to.",
		},
		async () => {
			try {
				const instances = await listInstances();

				if (instances.length === 0) {
					return buildToolResponse({
						status: "warn",
						title: "No credential files found",
						textSections: [
							"Create the 'instance_credentials' directory and add JSON credential files.",
						],
					});
				}

				return buildToolResponse({
					status: "success",
					title: `Available credential files (${instances.length})`,
					jsonData: instances,
				});
			} catch (error: unknown) {
				return buildToolResponse({
					status: "error",
					title: "Error listing credentials",
					textSections: [
						error instanceof Error ? error.message : String(error),
					],
				});
			}
		},
	);
}
