import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGelClient } from '../database.js';

export function registerExecuteEdgeql(server: McpServer) {
  server.tool(
    'execute-edgeql',
    'Execute a raw EdgeQL query on the Gel database',
    {
      query: z.string().describe('The EdgeQL query to execute'),
      args: z.record(z.any()).optional().describe('Optional query arguments'),
    },
    async (args) => {
      const gelClient = getGelClient();
      if (!gelClient) {
        return { content: [{ type: 'text', text: 'Database client is not initialized.' }] };
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
    }
  );
}
