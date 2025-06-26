import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGelClient } from '../database.js';

export function registerDescribeSchema(server: McpServer) {
  server.tool(
    'describe-schema',
    'Get schema information for a specific type',
    {
      typeName: z.string().describe('Name of the type to describe'),
    },
    async (args) => {
      const gelClient = getGelClient();
      if (!gelClient) {
        return { content: [{ type: 'text', text: 'Database client is not initialized.' }] };
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
