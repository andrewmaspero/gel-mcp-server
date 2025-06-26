import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export function registerRefreshSchema(server: McpServer) {
  server.registerTool(
    'refresh-schema',
    {
      title: 'Refresh Schema',
      description: 'Regenerate EdgeQL query builder files for the active Gel instance',
      inputSchema: {
        instance: z.string().optional(),
        branch: z.string().optional(),
      }
    },
    async (args) => {
      try {
        if (args.branch) {
          if (!args.instance) {
            return { content: [{ type: 'text', text: "Error: An instance name must be provided when switching branches."}] };
          }
          execSync(`npx gel branch switch ${args.branch} --instance ${args.instance}`, { stdio: 'inherit' });
        }

        // Use the project's auto-generation script instead
        const command = 'node scripts/auto-generate-schemas.js';
        execSync(command, { stdio: 'inherit', cwd: process.cwd() });
        
        const branchName = args.branch || process.env.GEL_BRANCH_ID || 'default';
        const srcDir = path.join('dbschema', 'edgeql-js');
        const destDir = path.join('src', 'edgeql-js');
        if (fs.existsSync(srcDir)) {
          fs.ensureDirSync(destDir);
          fs.copySync(srcDir, destDir, { overwrite: true });
        }
        return { content: [{ type: 'text', text: `Schema refreshed for ${branchName}` }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Failed to refresh schema: ${err.message}` }] };
      }
    }
  );
}
