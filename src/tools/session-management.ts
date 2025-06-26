import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { setDefaultConnection, getDefaultConnection } from '../session.js';

export function registerSessionManagement(server: McpServer) {
  server.registerTool(
    'set-default-connection',
    {
      title: 'Set Default Connection',
      description: 'Set the default instance and/or branch for the current session.',
      inputSchema: {
        instance: z.string().optional(),
        branch: z.string().optional(),
      }
    },
    async (args) => {
      setDefaultConnection(args.instance, args.branch);
      const currentDefaults = getDefaultConnection();
      return {
        content: [
          {
            type: 'text',
            text: `Default connection updated. Current defaults: ${JSON.stringify(currentDefaults)}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'get-default-connection',
    {
      title: 'Get Default Connection',
      description: 'Get the current default instance and branch for the session.',
      inputSchema: {}
    },
    async () => {
      const currentDefaults = getDefaultConnection();
      return {
        content: [
          {
            type: 'text',
            text: `Current default connection: ${JSON.stringify(currentDefaults)}`,
          },
        ],
      };
    }
  );
} 