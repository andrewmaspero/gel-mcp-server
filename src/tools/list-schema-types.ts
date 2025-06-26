import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabaseClient } from '../database.js';

export function registerListSchemaTypes(server: McpServer) {
  server.registerTool(
    'list-schema-types',
    {
      title: 'List Schema Types',
      description: 'List all object types in the schema. Uses the default connection if instance/branch are not provided.',
      inputSchema: {
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
          name
        }
        FILTER .name LIKE 'default::%'
        ORDER BY .name;
      `;
      try {
        const result = await gelClient.query(query);
        const types = (result as {name: string}[]).map(t => t.name.replace('default::', '')).sort();
        return { content: [{ type: 'text', text: 'Available schema types:' }, { type: 'text', text: JSON.stringify(types, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error listing schema types: ${error.message}` }] };
      }
    }
  );
} 