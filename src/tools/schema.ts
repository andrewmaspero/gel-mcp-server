import { execSync as exec } from "node:child_process";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findProjectRoot } from "../database.js";
import {
	buildToolResponse,
	getClientWithDefaults,
	getConnectionStatusMessage,
	validateConnectionArgs,
} from "../utils.js";
import { checkRateLimit, validateSchemaTypeName } from "../validation.js";

export function registerSchema(server: McpServer) {
	server.registerTool(
		"schema",
		{
			title: "Schema (Overview, Types, Describe, Refresh)",
			description:
				"Consolidated schema utility. Actions: 'overview' (default), 'types', 'describe', 'refresh'. Includes sensible defaults and suggested next tool calls to reduce errors.",
			inputSchema: {
				action: z.enum(["overview", "types", "describe", "refresh"]).optional(),
				typeName: z.string().optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
				topK: z.number().optional(),
			},
		},
		async (args) => {
			checkRateLimit("schema");
			// Validate optional instance/branch
			validateConnectionArgs(args);

			const { client, instance, branch, autoSelected } =
				getClientWithDefaults(args);

			if (!client || !instance) {
				return {
					content: [
						{
							type: "text" as const,
							text: "❌ Database client could not be initialized. Try: @[list-instances] then @[set-default-connection].",
						},
					],
				};
			}

			const selectedAction = args.action ?? "overview";
			const statusMessage = getConnectionStatusMessage(
				instance,
				branch,
				autoSelected,
			);

			// Queries reused from existing tools
			const listTypesQuery = `
                WITH module schema
                SELECT ObjectType { name }
                FILTER .name LIKE 'default::%'
                ORDER BY .name;
            `;

			const describeQuery = `
                WITH module schema
                SELECT ObjectType {
                  name,
                  properties: { name, target: { name }, cardinality, required },
                  links: { name, target: { name }, cardinality, required }
                }
                FILTER .name = <str>$typeName
            `;

			const overviewQuery = `
                SELECT schema::ObjectType {
                  name,
                  properties: { name, target: { name } },
                  links: { name, target: { name } }
                }
                FILTER NOT .name LIKE 'schema::%'
                  AND NOT .name LIKE 'sys::%'
                  AND NOT .name LIKE 'cfg::%'
                  AND NOT .name LIKE 'cal::%'
            `;

			try {
				switch (selectedAction) {
					case "types": {
						const result = await client.query(listTypesQuery);
						const types = (result as { name: string }[]).map((t) =>
							t.name.replace("default::", ""),
						);

						const topK = Math.max(1, Math.min(args.topK ?? 30, 100));
						const preview = types.slice(0, topK);

						return buildToolResponse({
							status: "success",
							title: `Schema types${statusMessage}`,
							jsonData: { types },
							textSections: [
								`Found ${types.length} type(s). Showing first ${preview.length}:\n${preview.join(", ")}`,
								"Suggested next step: describe a type (replace <Type>):",
								'@[schema action="describe" typeName="<Type>"]',
							],
						});
					}
					case "describe": {
						if (!args.typeName) {
							return {
								content: [
									{
										type: "text" as const,
										text: "❌ Missing 'typeName'. Try: @[schema action=\"types\"] then rerun describe.",
									},
								],
							};
						}
						try {
							validateSchemaTypeName(args.typeName);
						} catch (err) {
							return {
								content: [
									{
										type: "text" as const,
										text: `❌ Invalid type name: ${
											err instanceof Error ? err.message : String(err)
										}`,
									},
								],
							};
						}
						const fullName = `default::${args.typeName}`;
						const result = await client.query(describeQuery, {
							typeName: fullName,
						});
						if (!result || (Array.isArray(result) && result.length === 0)) {
							const typesRes = await client.query(listTypesQuery);
							const types = (typesRes as { name: string }[]).map((t) =>
								t.name.replace("default::", ""),
							);
							return buildToolResponse({
								status: "error",
								title: `Type '${args.typeName}' not found`,
								statusMessage,
								textSections: [
									`Available types include: ${types.slice(0, 30).join(", ")}${
										types.length > 30 ? " …" : ""
									}`,
									'Try: @[schema action="describe" typeName="<Type>"].',
								],
							});
						}
						return buildToolResponse({
							status: "success",
							title: `Schema for '${args.typeName}'`,
							statusMessage,
							jsonData: result,
							textSections: [
								"You can now validate or run a query:",
								`@[validate-query query=\"SELECT ${args.typeName}\"]`,
								`@[execute-edgeql query=\"SELECT ${args.typeName}\"]`,
							],
						});
					}
					case "refresh": {
						// Reuse the refresh behavior inline to consolidate UX
						const projectRoot = findProjectRoot();
						const credentialsPath = path.join(
							projectRoot,
							"instance_credentials",
							`${instance}.json`,
						);
						const outputPath = path.join(projectRoot, "src", "edgeql-js");
						const cmd = `npx @gel/generate edgeql-js --credentials-file ${credentialsPath} --output-dir ${outputPath} --target ts --force-overwrite`;
						let out = "";
						try {
							out = exec(cmd, {
								encoding: "utf8",
								timeout: 30000,
								cwd: projectRoot,
							});
						} catch (e) {
							return {
								content: [
									{
										type: "text" as const,
										text: `❌ Failed to refresh schema: ${
											e instanceof Error ? e.message : String(e)
										}`,
									},
								],
							};
						}
						return buildToolResponse({
							status: "success",
							title: `Regenerated query builder for '${instance}'`,
							statusMessage,
							textSections: [out || "Schema generation completed"],
						});
					}
					default: {
						const result = await client.query(overviewQuery);
						// Also pre-compute types for immediate use
						const typesRes = await client.query(listTypesQuery);
						const types = (typesRes as { name: string }[]).map((t) =>
							t.name.replace("default::", ""),
						);
						return buildToolResponse({
							status: "success",
							title: `Schema overview${statusMessage}`,
							jsonData: { overview: result, types },
							textSections: [
								`Detected ${types.length} type(s). Example: ${types
									.slice(0, 10)
									.join(", ")}${types.length > 10 ? " …" : ""}`,
								"Next: describe a type or validate a simple query:",
								'@[schema action="describe" typeName="<Type>"]',
								'@[validate-query query="SELECT <Type>"]',
							],
						});
					}
				}
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ Schema tool error: ${
								error instanceof Error ? error.message : String(error)
							}`,
						},
					],
				};
			}
		},
	);
}
