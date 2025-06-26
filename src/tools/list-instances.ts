import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAvailableInstances } from '../database.js';

export function registerListInstances(server: McpServer) {
  server.registerTool(
    'list-instances',
    {
      title: 'List Instances',
      description: 'List all available Gel database instances by scanning the instance_credentials folder.',
      inputSchema: {}
    },
    async () => {
      try {
        const instances = getAvailableInstances();
        
        if (instances.length === 0) {
          return {
            content: [
              { type: 'text', text: 'No instance_credentials directory found. Create this directory and add JSON credential files to define instances.' },
            ],
          };
        }

        return {
          content: [
            { type: 'text', text: `Found ${instances.length} instance(s): ${instances.join(', ')}` },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: 'text', text: `Error scanning instances: ${error.message}` },
          ],
        };
      }
    }
  );
} 