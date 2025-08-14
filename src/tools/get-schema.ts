import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLogger } from "../logger.js";
import {
	buildToolResponse,
	getClientWithDefaults,
	getConnectionStatusMessage,
	validateConnectionArgs,
} from "../utils.js";
import { checkRateLimit } from "../validation.js";

const logger = createLogger("get-schema");

export function registerGetSchema(server: McpServer) {
	server.registerTool(
		"get-schema",
		{
			title: "Get Database Schema",
			description:
				"Retrieves the complete database schema. Uses the current default connection if no instance/branch is specified.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			try {
				checkRateLimit("get-schema");
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
          SELECT schema::ObjectType {
            name,
            properties: {
              name,
              target: { name }
            },
            links: {
              name,
              target: { name }
            }
          }
          FILTER NOT .name LIKE 'schema::%' AND NOT .name LIKE 'sys::%' AND NOT .name LIKE 'cfg::%' AND NOT .name LIKE 'cal::%'
        `;

				try {
					const result: {
						name: string;
						properties: { name: string; target: { name: string } }[];
						links: { name: string; target: { name: string } }[];
					}[] = await client.query(query);

					const statusMessage = getConnectionStatusMessage(
						instance,
						branch,
						autoSelected,
					);
					const textSections: string[] = [];
					const schemaText = `Database Schema${statusMessage}:\n`;
					textSections.push(schemaText);
					// Returning as JSON as well for structured consumption
					return buildToolResponse({
						status: "success",
						title: "Schema overview",
						statusMessage,
						textSections,
						jsonData: result,
					});
				} catch (error: unknown) {
					return {
						content: [
							{
								type: "text",
								text: `❌ Error fetching schema: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			} catch (error: unknown) {
				logger.error("Schema fetch error:", {
					error: error instanceof Error ? error.message : String(error),
				});
				return {
					content: [
						{
							type: "text",
							text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
