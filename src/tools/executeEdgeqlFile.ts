import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import JSON5 from "json5";
import { z } from "zod";
import { createLogger } from "../logger.js";
import {
	buildToolResponse,
	getClientWithDefaults,
	validateConnectionArgs,
} from "../utils.js";
import { checkRateLimit, validateQueryArgs } from "../validation.js";

const logger = createLogger("executeEdgeqlFile");

export function registerExecuteEdgeqlFile(server: McpServer) {
	server.registerTool(
		"execute-edgeql-file",
		{
			title: "Execute EdgeQL Query from File",
			description:
				"Executes an EdgeQL query from a .edgeql file with optional parameters and data. " +
				"This is useful for complex queries that are too long to include inline. " +
				"Parameters can be provided as a JSON string. " +
				"Data can be loaded from a JSON file and made available as a `$data` parameter.",
			inputSchema: {
				file_path: z
					.string()
					.describe(
						"Path to the .edgeql file. The path is resolved relative to the current working directory.",
					),
				data_file: z
					.string()
					.optional()
					.describe(
						"Path to a JSON file containing data to inject as a `$data` parameter. Resolved relative to the current working directory.",
					),
				json_args: z
					.string()
					.optional()
					.describe(
						'Query parameters as a JSON string. e.g., \'{"name": "Alice"}\'',
					),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			try {
				// Rate limit execute
				checkRateLimit("execute-edgeql-file", true);
				// Validate optional instance/branch
				validateConnectionArgs(args);

				let resolvedPath: string;
				if (path.isAbsolute(args.file_path)) {
					resolvedPath = args.file_path;
				} else {
					resolvedPath = path.resolve(process.cwd(), args.file_path);
				}

				if (!fs.existsSync(resolvedPath)) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ File not found at the specified path: ${resolvedPath}`,
							},
						],
					};
				}
				const filePath = resolvedPath;

				if (!filePath.endsWith(".edgeql")) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ File must have .edgeql extension. Got: ${path.extname(
									filePath,
								)}`,
							},
						],
					};
				}

				const queryContent = fs.readFileSync(filePath, "utf8").trim();
				if (!queryContent) {
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ File is empty: ${filePath}`,
							},
						],
					};
				}

				let queryArgs: Record<string, unknown> = {};
				if (args.json_args) {
					try {
						queryArgs = JSON.parse(args.json_args);
					} catch (_parseError) {
						try {
							queryArgs = JSON5.parse(args.json_args);
						} catch (parseError2) {
							return {
								content: [
									{
										type: "text" as const,
										text: `❌ Invalid JSON in json_args: ${
											parseError2 instanceof Error
												? parseError2.message
												: String(parseError2)
										}`,
									},
								],
							};
						}
					}
				}

				if (args.data_file) {
					let dataFilePath = args.data_file;
					if (!path.isAbsolute(dataFilePath)) {
						dataFilePath = path.resolve(process.cwd(), dataFilePath);
					}

					if (!fs.existsSync(dataFilePath)) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Data file not found: ${dataFilePath}`,
								},
							],
						};
					}

					if (
						!dataFilePath.endsWith(".json") &&
						!dataFilePath.endsWith(".json5")
					) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Data file must have .json or .json5 extension. Got: ${path.extname(
										dataFilePath,
									)}`,
								},
							],
						};
					}

					try {
						const dataContent = fs.readFileSync(dataFilePath, "utf8");

						let parsedData: unknown;
						try {
							parsedData = JSON.parse(dataContent);
						} catch (_jsonErr) {
							try {
								parsedData = JSON5.parse(dataContent);
							} catch (json5Err) {
								return {
									content: [
										{
											type: "text" as const,
											text: `❌ Invalid JSON in data_file: ${
												json5Err instanceof Error
													? json5Err.message
													: String(json5Err)
											}. Please ensure the file contains valid JSON or JSON5 syntax.`,
										},
									],
								};
							}
						}

						queryArgs.data = parsedData;
					} catch (dataError) {
						return {
							content: [
								{
									type: "text" as const,
									text: `❌ Error reading data file: ${
										dataError instanceof Error
											? dataError.message
											: String(dataError)
									}`,
								},
							],
						};
					}
				}

				const { client, instance, autoSelected } = getClientWithDefaults(args);

				if (!client || !instance) {
					return {
						content: [
							{
								type: "text" as const,
								text: "❌ Database client could not be initialized.",
							},
						],
					};
				}

				const result = await client.query(
					queryContent,
					validateQueryArgs(queryArgs),
				);

				const statusMessage = autoSelected
					? ` (auto-selected instance: ${instance})`
					: "";
				return buildToolResponse({
					status: "success",
					title: `Query executed successfully from: ${path.basename(filePath)}`,
					statusMessage,
					jsonData: result,
				});
			} catch (error: unknown) {
				logger.error("EdgeQL file execution error:", {
					error: error instanceof Error ? error.message : String(error),
				});
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ Error executing query from file: ${
								error instanceof Error ? error.message : String(error)
							}`,
						},
					],
				};
			}
		},
	);
}
