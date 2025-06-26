import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabaseClient } from '../database.js';

export function registerDescribeSchema(server: McpServer) {
  server.registerTool(
    'describe-schema',
    {
      title: 'Describe Schema Type',
      description: 'Get schema information for a specific type. Uses the default connection if instance/branch are not provided.',
      inputSchema: {
        typeName: z.string(),
        instance: z.string().optional(),
        branch: z.string().optional(),
      }
    },
    async (args) => {
      const gelClient = getDatabaseClient({ instance: args.instance, branch: args.branch });
      if (!gelClient) {
        return { content: [{ type: 'text', text: 'Database client could not be initialized.' }] };
      }
      const query = `
        WITH module schema
        SELECT ObjectType {
          name,
          properties: {
            name,
            target: { name },
            cardinality,
            required
          },
          links: {
            name,
            target: { name },
            cardinality,
            required
          }
        }
        FILTER .name = <str>$typeName
      `;
      const result = await gelClient.query(query, { typeName: `default::${args.typeName}` });
      if (!result || result.length === 0) {
        return { content: [{ type: 'text', text: `Type '${args.typeName}' not found in the schema.` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
