import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execSync } from 'child_process';
import { z } from 'zod';
import { getDefaultConnection } from '../session.js';

export function registerListBranches(server: McpServer) {
  server.registerTool(
    'list-branches',
    {
      title: 'List Branches',
      description: 'List all branches for a specific Gel database instance.',
      inputSchema: {
        instance: z.string().optional(),
      }
    },
    async (args) => {
      try {
        const session = getDefaultConnection();
        const targetInstance = args.instance || session.defaultInstance || 'afca_intelligence';
        
        const output = execSync(`npx gel branch list --instance ${targetInstance}`, {
          encoding: 'utf8',
          timeout: 10000, // 10 second timeout
          cwd: process.cwd()
        });
        
        // Parse the text output format: "main - Current\ndev"
        const branches = output.trim().split('\n').map(line => {
          const parts = line.split(' - ');
          return {
            name: parts[0].trim(),
            current: parts.length > 1 && parts[1].includes('Current')
          };
        });
        
        const branchList = branches.map((branch: any) => 
          `- ${branch.name}${branch.current ? ' (current)' : ''}`
        ).join('\n');
        
        return {
          content: [
            { type: 'text', text: `Branches for instance '${targetInstance}':\n${branchList}` },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: 'text', text: `Error listing branches: ${error.message}` },
          ],
        };
      }
    }
  );
} 