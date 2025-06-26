import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGelClient } from '../database.js';

export function registerValidateQuery(server: McpServer) {
  server.tool(
    'validate-query',
    'Validate EdgeQL query syntax without executing it',
    {
      query: z.string().describe('The EdgeQL query to validate'),
    },
    async (args) => {
      const gelClient = getGelClient();
      if (!gelClient) {
        return { content: [{ type: 'text', text: 'Database client is not initialized.' }] };
      }
      const analyzeQuery = `ANALYZE ${args.query};`;
      await gelClient.query(analyzeQuery);
      return { content: [{ type: 'text', text: 'Query syntax is valid.' }] };
    }
  );
}
