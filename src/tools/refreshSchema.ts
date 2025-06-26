import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export function registerRefreshSchema(server: McpServer) {
  server.tool(
    'refresh-schema',
    'Regenerate EdgeQL query builder files for the active Gel instance',
    {
      instance: z.string().optional().describe('Instance/branch name (defaults to env GEL_BRANCH_ID)'),
    },
    async (args) => {
      try {
        execSync('npx gel generate edgeql-js', { stdio: 'inherit' });
        const branch = args.instance || process.env.GEL_BRANCH_ID || 'default';
        const srcDir = path.join('dbschema', 'edgeql-js');
        const destDir = path.join('src', 'edgeql-js');
        if (fs.existsSync(srcDir)) {
          fs.ensureDirSync(destDir);
          fs.copySync(srcDir, destDir, { overwrite: true });
        }
        return { content: [{ type: 'text', text: `Schema refreshed for ${branch}` }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Failed to refresh schema: ${err.message}` }] };
      }
    }
  );
}
