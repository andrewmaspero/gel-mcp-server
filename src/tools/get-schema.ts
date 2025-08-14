import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLogger } from "../logger.js";
import { getClientWithDefaults, getConnectionStatusMessage } from "../utils.js";
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
					let schemaText = `Database Schema${statusMessage}:\n\n`;

					result.forEach((type) => {
						schemaText += `type ${type.name.replace("default::", "")} {\n`;
						type.properties.forEach((prop) => {
							schemaText += `  property ${prop.name} -> ${prop.target.name.replace("std::", "")};\n`;
						});
						type.links.forEach((link) => {
							schemaText += `  link ${link.name} -> ${link.target.name.replace("default::", "")};\n`;
						});
						schemaText += "}\n\n";
					});

					return { content: [{ type: "text", text: schemaText }] };
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
