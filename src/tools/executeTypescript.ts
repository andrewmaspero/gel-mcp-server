import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGelClient, initGelClient } from '../database.js';
import vm from 'vm';

export function registerExecuteTypescript(server: McpServer) {
  server.tool(
    'execute-typescript',
    'Execute TypeScript with EdgeDB query builder access. Use with caution: running code from remote sources can be dangerous.',
    {
      code: z.string().describe('The TypeScript code to execute'),
      timeout: z.number().optional().describe('Execution time in ms (default 5000)'),
      use_gel_client: z.boolean().optional().describe('Automatically inject gel client (default true)'),
    },
    async (args) => {
      const gelClient = getGelClient();
      if (args.use_gel_client !== false && !gelClient) {
        await initGelClient();
      }
      const context = {
        gelClient: args.use_gel_client === false ? undefined : getGelClient(),
        console,
        require,
      } as any;
      const script = new vm.Script(args.code);
      const result = await script.runInNewContext(context, { timeout: args.timeout || 5000 });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
