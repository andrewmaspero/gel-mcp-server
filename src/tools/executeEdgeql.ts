import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabaseClient } from '../database.js';

export function registerExecuteEdgeql(server: McpServer) {
  server.registerTool(
    'execute-edgeql',
    {
      title: 'Execute EdgeQL Query',
      description: 'Execute a raw EdgeQL query. Uses the default connection if instance/branch are not provided.',
      inputSchema: {
        query: z.string(),
        args: z.record(z.string(), z.any()).optional(),
        instance: z.string().optional(),
        branch: z.string().optional(),
      }
    },
    async (args) => {
      try {
      const gelClient = getDatabaseClient({ instance: args.instance, branch: args.branch });
      if (!gelClient) {
        return { content: [{ type: 'text', text: 'Database client could not be initialized.' }] };
      }
        
      let result;
      if (args.args && Object.keys(args.args).length > 0) {
        result = await gelClient.query(args.query, args.args);
      } else {
        result = await gelClient.query(args.query);
      }
      return {
        content: [
          { type: 'text', text: 'Query executed successfully:' },
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
      };
      } catch (error: any) {
        return {
          content: [
            { type: 'text', text: `Error executing query: ${error.message}` },
          ],
        };
      }
    }
  );
}
