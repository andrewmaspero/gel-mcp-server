import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	buildToolResponse,
	getClientWithDefaults,
	validateConnectionArgs,
} from "../utils.js";
import { checkRateLimit, validateQueryArgs } from "../validation.js";

export function registerQuery(server: McpServer) {
	server.registerTool(
		"query",
		{
			title: "Query (Validate, Run, File)",
			description:
				"Consolidated query tool. Actions: 'validate', 'run', 'file'. Supports args validation, default LIMITs, and safe text output mode.",
			inputSchema: {
				action: z.enum(["validate", "run", "file"]).optional(),
				query: z.string().optional(),
				args: z.record(z.string(), z.any()).optional(),
				filePath: z.string().optional(),
				format: z.enum(["json", "text"]).optional(),
				limit: z.number().optional(),
				timeout: z.number().optional(),
				dryRun: z.boolean().optional(),
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
		},
		async (args) => {
			checkRateLimit("query");
			validateConnectionArgs(args);
			const { client, instance } = getClientWithDefaults(args);
			if (!client || !instance) {
				return buildToolResponse({
					status: "error",
					title: "Database client could not be initialized",
					textSections: [
						'Try: @[connection action="auto"] or @[connection action="set" instance="<NAME>" branch="main"]',
					],
				});
			}

			const action = args.action ?? "validate";
			const limit = Math.max(1, Math.min(args.limit ?? 50, 1000));
			const format = args.format ?? "json";

			try {
				if (action === "file") {
					if (!args.filePath) {
						return buildToolResponse({
							status: "error",
							title: "Missing 'filePath'",
						});
					}
					const resolved = path.isAbsolute(args.filePath)
						? args.filePath
						: path.resolve(process.cwd(), args.filePath);
					if (!fs.existsSync(resolved)) {
						return buildToolResponse({
							status: "error",
							title: `File not found: ${resolved}`,
						});
					}
					const q = fs.readFileSync(resolved, "utf8").trim();
					if (!q)
						return buildToolResponse({
							status: "error",
							title: "File is empty",
						});
					const sanitized = args.args
						? validateQueryArgs(args.args)
						: undefined;
					const rows = await client.query(q, sanitized as any);
					return buildToolResponse({
						status: "success",
						title: `Executed file: ${path.basename(resolved)}`,
						jsonData: rows,
					});
				}

				if (!args.query) {
					return buildToolResponse({
						status: "error",
						title: "Missing 'query'",
					});
				}
				const q = args.query;
				const sanitized = args.args ? validateQueryArgs(args.args) : undefined;

				if (action === "validate") {
					// Use a transaction to rollback
					await client.transaction(async (tx) => {
						await tx.query(q, sanitized as any);
						throw new Error("VALID");
					});
					// Should not reach here
					return buildToolResponse({
						status: "error",
						title: "Unexpected validation state",
					});
				}

				// run
				let finalQuery = q;
				// apply a LIMIT if user didn't specify one and query looks like a SELECT
				if (/^\s*SELECT\b/i.test(q) && !/\bLIMIT\b/i.test(q)) {
					finalQuery = `${q}\nLIMIT ${limit}`;
				}
				const rows = await client.query(finalQuery, sanitized as any);
				if (format === "text") {
					const text = Array.isArray(rows)
						? rows
								.slice(0, limit)
								.map((r) => JSON.stringify(r))
								.join("\n")
						: String(rows);
					return { content: [{ type: "text", text }] };
				}
				return buildToolResponse({
					status: "success",
					title: "Query executed",
					jsonData: rows,
				});
			} catch (err: unknown) {
				if (err instanceof Error && err.message === "VALID") {
					return { content: [{ type: "text", text: "✅ Query is valid" }] };
				}
				return buildToolResponse({
					status: "error",
					title: "Query error",
					textSections: [err instanceof Error ? err.message : String(err)],
				});
			}
		},
	);
}
