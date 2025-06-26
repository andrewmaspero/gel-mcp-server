import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execSync } from 'child_process';
import { z } from 'zod';

export function registerSwitchBranch(server: McpServer) {
  server.registerTool(
    'switch-branch',
    {
      title: 'Switch Branch',
      description: 'Switch the active branch for a given instance.',
      inputSchema: {
        instance: z.string(),
        branch: z.string(),
      }
    },
    async (args) => {
      try {
        execSync(`npx gel branch switch ${args.branch} --instance ${args.instance}`, {
          encoding: 'utf-8',
        });
        return {
          content: [
            { type: 'text', text: `Successfully switched to branch '${args.branch}' on instance '${args.instance}'.` },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: 'text', text: `Error switching branch: ${error.message}` },
          ],
        };
      }
    }
  );
} 