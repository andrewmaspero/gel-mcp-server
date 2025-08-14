// Deprecated tool: replaced by consolidated 'schema' tool (refresh)
import { execSync as exec } from "node:child_process";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findProjectRoot } from "../../database.js";
import { getDefaultConnection } from "../../session.js";

export function registerRefreshSchema(server: McpServer) {
  server.registerTool(
    "refresh-schema",
    {
      title: "Regenerate Query Builder Files",
      description: "Regenerates the EdgeQL query builder files for the active Gel instance.",
      inputSchema: { instance: z.string().optional(), branch: z.string().optional() },
    },
    async (args) => {
      try {
        const session = getDefaultConnection();
        const targetInstance = args.instance || session.defaultInstance;
        const targetBranch = args.branch || session.defaultBranch || "main";
        if (!targetInstance) {
          return { content: [{ type: "text", text: "Error: No instance provided and no default instance is set." }] };
        }
        const projectRoot = findProjectRoot();
        const outputPath = path.join(projectRoot, "src", "edgeql-js");
        const credentialsPath = path.join(projectRoot, "instance_credentials", `${targetInstance}.json`);
        const cmd = `npx @gel/generate edgeql-js --credentials-file ${credentialsPath} --output-dir ${outputPath} --target ts --force-overwrite`;
        try {
          const output = exec(cmd, { encoding: "utf8", timeout: 30000, cwd: projectRoot });
          return { content: [ { type: "text", text: `Successfully regenerated query builder for instance '${targetInstance}' branch '${targetBranch}'` }, { type: "text", text: `Output: ${output || "Schema generation completed"}` } ] };
        } catch (error: unknown) {
          return { content: [ { type: "text", text: `Failed to regenerate schema: ${error instanceof Error ? error.message : String(error)}` } ] };
        }
      } catch (error: unknown) {
        return { content: [ { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } ] };
      }
    },
  );
}


