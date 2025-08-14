// Deprecated tool: replaced by consolidated 'connection' tool (listInstances)
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAvailableInstances } from "../../database.js";

export function registerListInstances(server: McpServer) {
  server.registerTool(
    "list-instances",
    {
      title: "List Instances",
      description: "Lists all configured database instances.",
      inputSchema: {},
    },
    async () => {
      try {
        const instances = getAvailableInstances();
        if (instances.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No instances found. Create 'instance_credentials' and add JSON files.",
              },
            ],
          };
        }
        return {
          content: [
            { type: "text", text: `Found ${instances.length} instance(s): ${instances.join(", ")}` },
          ],
        };
      } catch (error: unknown) {
        return {
          content: [
            { type: "text", text: `Error listing instances: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    },
  );
}


