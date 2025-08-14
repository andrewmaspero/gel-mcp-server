import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deleteByPrefix, getCached } from "../cache.js";
import { buildToolResponse } from "../utils.js";

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
        },
        async (args) => {
            if (args.instance) {
                deleteByPrefix(`schema:get-schema:${args.instance}:`);
                deleteByPrefix(`schema:list-schema-types:${args.instance}:`);
                return buildToolResponse({
                    status: "success",
                    title: `Cleared schema cache for instance '${args.instance}'`,
                });
            }
            deleteByPrefix("schema:get-schema:");
            deleteByPrefix("schema:list-schema-types:");
            return buildToolResponse({ status: "success", title: "Cleared all schema cache" });
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
        },
        async (args) => {
            const key = `schema:${args.kind}:${args.instance}:${args.branch ?? ""}`;
            const value = getCached<unknown>(key);
            if (value === undefined) {
                return buildToolResponse({ status: "info", title: `No cache entry for ${key}` });
            }
            return buildToolResponse({ status: "success", title: `Cache hit for ${key}`, jsonData: value });
        },
    );
}


