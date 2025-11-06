import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deleteByPrefix, getCached } from "../cache.js";
import { buildStructuredResponse } from "../utils.js";
import {
	CacheClearResultSchema,
	CachePeekResultSchema,
} from "../types/cache.js";

export function registerCacheTools(server: McpServer) {
	server.registerTool(
		"cache-clear",
		{
			title: "Clear Schema Cache",
			description:
				"Clears the in-memory schema cache. Optionally clear only for a specific instance/branch.",
			inputSchema: {
				instance: z.string().optional(),
				branch: z.string().optional(),
			},
			outputSchema: CacheClearResultSchema.shape,
		},
		async (args) => {
			if (args.instance) {
				deleteByPrefix(`schema:get-schema:${args.instance}:`);
				deleteByPrefix(`schema:list-schema-types:${args.instance}:`);
				return buildStructuredResponse({
					status: "success",
					title: `Cleared schema cache for instance '${args.instance}'`,
					textSections: [
						"Removed cached schema overview and type listings for the specified instance.",
					],
					data: {
						status: "ok",
						message: "Schema cache cleared for instance",
						scope: {
							instance: args.instance,
							branch: args.branch,
						},
					},
				});
			}
			deleteByPrefix("schema:get-schema:");
			deleteByPrefix("schema:list-schema-types:");
			return buildStructuredResponse({
				status: "success",
				title: "Cleared all schema cache",
				textSections: [
					"Global schema cache entries have been removed.",
				],
				data: {
					status: "ok",
					message: "Cleared entire schema cache",
					scope: {},
				},
			});
		},
	);

	server.registerTool(
		"cache-peek",
		{
			title: "Inspect Schema Cache Entry",
			description:
				"Returns a schema cache entry if present. Useful for debugging cache behavior.",
			inputSchema: {
				kind: z.enum(["get-schema", "list-schema-types"]),
				instance: z.string(),
				branch: z.string().optional(),
			},
			outputSchema: CachePeekResultSchema.shape,
		},
		async (args) => {
			const key = `schema:${args.kind}:${args.instance}:${args.branch ?? ""}`;
			const value = getCached<unknown>(key);
			if (value === undefined) {
				return buildStructuredResponse({
					status: "info",
					title: `No cache entry for ${key}`,
					textSections: [
						"The requested key is not present in the in-memory schema cache.",
					],
					data: {
						status: "info",
						key,
						hit: false,
					},
				});
			}
			return buildStructuredResponse({
				status: "success",
				title: `Cache hit for ${key}`,
				jsonData: value,
				data: {
					status: "ok",
					key,
					hit: true,
					value,
				},
			});
		},
	);
}
