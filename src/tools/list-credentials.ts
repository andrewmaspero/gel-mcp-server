import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAvailableInstances } from '../database.js';

export function registerListCredentials(server: McpServer) {
  server.registerTool(
    'list-credentials',
    {
      title: 'List Credentials',
      description: 'List all available instance credential files in the instance_credentials directory.',
      inputSchema: {}
    },
    async () => {
      try {
        const instanceNames = getAvailableInstances();
        
        if (instanceNames.length === 0) {
          return { 
            content: [{ 
              type: 'text', 
              text: 'No instance_credentials directory found. Create this directory and add JSON credential files to define instances.' 
            }] 
          };
        }

        return {
          content: [
            { type: 'text', text: `Found ${instanceNames.length} credential file(s) for instances:` },
            { type: 'text', text: JSON.stringify(instanceNames, null, 2) },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: 'text', text: `Error listing credential files: ${error.message}` },
          ],
        };
      }
    }
  );
} 