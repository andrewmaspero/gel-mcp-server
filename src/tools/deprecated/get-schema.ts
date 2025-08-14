// Deprecated tool: replaced by consolidated 'schema' tool (overview)
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildToolResponse, getClientWithDefaults, getConnectionStatusMessage, validateConnectionArgs } from "../../utils.js";
import { checkRateLimit } from "../../validation.js";

export function registerGetSchema(server: McpServer) {
  server.registerTool(
    "get-schema",
    {
      title: "Get Database Schema",
      description: "Retrieves the complete database schema.",
      inputSchema: { instance: z.string().optional(), branch: z.string().optional() },
    },
    async (args) => {
      try {
        checkRateLimit("get-schema");
        validateConnectionArgs(args);
        const { client, instance, branch, autoSelected } = getClientWithDefaults(args);
        if (!client || !instance) {
          return { content: [{ type: "text", text: "❌ Database client could not be initialized." }] };
        }
        const query = `
          SELECT schema::ObjectType { name, properties: { name, target: { name } }, links: { name, target: { name } } }
          FILTER NOT .name LIKE 'schema::%' AND NOT .name LIKE 'sys::%' AND NOT .name LIKE 'cfg::%' AND NOT .name LIKE 'cal::%'
        `;
        const result = await client.query(query);
        const statusMessage = getConnectionStatusMessage(instance, branch, autoSelected);
        return buildToolResponse({ status: "success", title: "Schema overview", statusMessage, jsonData: result });
      } catch (error: unknown) {
        return { content: [{ type: "text", text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    },
  );
}


