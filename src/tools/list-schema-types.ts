import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getClientWithDefaults,
	getConnectionStatusMessage,
	safeJsonStringify,
} from "../utils.js";
import { checkRateLimit } from "../validation.js";
import { validateConnectionArgs } from "../utils.js";

export function registerListSchemaTypes(server: McpServer) {
	server.registerTool(
		"list-schema-types",
		{
			title: "List Schema Types",
			description:
				"Lists all object types (e.g., User, Product) in the database schema. Uses the current default connection if no instance/branch is specified.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			checkRateLimit("list-schema-types");
            validateConnectionArgs(args);
			const { client, instance, branch, autoSelected } =
				getClientWithDefaults(args);

			if (!client || !instance) {
				return {
					content: [
						{
							type: "text",
							text: "❌ Database client could not be initialized.",
						},
					],
				};
			}

			const query = `
        WITH module schema
        SELECT ObjectType {
          name
        }
        FILTER .name LIKE 'default::%'
        ORDER BY .name;
      `;

			try {
				const result = await client.query(query);
				const types = (result as { name: string }[])
					.map((t) => t.name.replace("default::", ""))
					.sort();

				const statusMessage = getConnectionStatusMessage(
					instance,
					branch,
					autoSelected,
				);
				return {
					content: [
						{ type: "text", text: `Available schema types${statusMessage}:` },
						{ type: "text", text: safeJsonStringify(types) },
					],
				};
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `❌ Error listing schema types: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
