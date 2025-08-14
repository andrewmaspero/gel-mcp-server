import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	buildToolResponse,
	getClientWithDefaults,
	getConnectionStatusMessage,
} from "../utils.js";
import { checkRateLimit, validateSchemaTypeName } from "../validation.js";

export function registerDescribeSchema(server: McpServer) {
	server.registerTool(
		"describe-schema",
		{
			title: "Describe Schema Type",
			description:
				"Get detailed information about a specific schema type, including its properties and links. Uses the current default connection if no instance/branch is specified.",
			inputSchema: {
				typeName: z.string(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			checkRateLimit("describe-schema");
			// Validate input
			try {
				validateSchemaTypeName(args.typeName);
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ Invalid type name: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
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
          name,
          properties: {
            name,
            target: { name },
            cardinality,
            required
          },
          links: {
            name,
            target: { name },
            cardinality,
            required
          }
        }
        FILTER .name = <str>$typeName
      `;
			const result = await client.query(query, {
				typeName: `default::${args.typeName}`,
			});
			if (!result || result.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `Type '${args.typeName}' not found in the schema.`,
						},
					],
				};
			}

			const statusMessage = getConnectionStatusMessage(
				instance,
				branch,
				autoSelected,
			);
			return buildToolResponse({
				status: "success",
				title: `Schema for '${args.typeName}'`,
				statusMessage,
				jsonData: result,
			});
		},
	);
}
