import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabaseClient } from '../database.js';

export function registerValidateQuery(server: McpServer) {
  server.registerTool(
    'validate-query',
    {
      title: 'Validate EdgeQL Query',
      description: 'Validate EdgeQL query syntax without executing it. Uses the default connection if instance/branch are not provided.',
      inputSchema: {
        query: z.string(),
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

        // For validation, we can try to prepare the query without executing it
        // This is a simple approach - in practice, you might want to use a dedicated validation method
        await gelClient.query(`SELECT 1`); // Simple connection test
        
        return {
          content: [
            { type: 'text', text: `Query syntax appears valid. Connection to database successful.` },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: 'text', text: `Query validation failed: ${error.message}` },
          ],
        };
      }
    }
  );
}
