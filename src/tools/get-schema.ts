import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDatabaseClient } from '../database.js';

export function registerGetSchema(server: McpServer) {
  server.registerTool(
    'get-schema',
    {
      title: 'Get Complete Schema',
      description: 'Get the entire schema for a given instance/branch as a single text block. Uses the default connection if not provided.',
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
          name,
          properties: {
            name,
            target: {
              name
            }
          },
          links: {
            name,
            target: {
              name
            }
          }
        }
        FILTER .name LIKE 'default::%'
        ORDER BY .name;
      `;
      
      try {
        const result: any[] = await gelClient.query(query);
        let schemaText = 'Database Schema:\n\n';
        result.forEach(type => {
          schemaText += `type ${type.name.replace('default::', '')} {\n`;
          type.properties.forEach((prop: any) => {
            schemaText += `  property ${prop.name} -> ${prop.target.name.replace('std::', '')};\n`;
          });
          type.links.forEach((link: any) => {
            schemaText += `  link ${link.name} -> ${link.target.name.replace('default::', '')};\n`;
          });
          schemaText += '}\n\n';
        });
        
        return { content: [{ type: 'text', text: schemaText }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error getting schema: ${error.message}` }] };
      }
    }
  );
} 