import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabaseClient } from '../database.js';
import vm from 'vm';

export function registerExecuteTypescript(server: McpServer) {
  server.registerTool(
    'execute-typescript',
    {
      title: 'Execute TypeScript Code',
      description: `Execute TypeScript with EdgeDB query builder access. Uses the default connection if instance/branch are not provided.
Use with caution: running code from remote sources can be dangerous.
Best practices:
- Use 'await gelClient.query()' with 'console.log' to display results
- Use 'ORDER BY' with 'THEN', not commas (e.g., 'ORDER BY .field1 THEN .field2')
- Keep code simple and focused on a single operation`,
      inputSchema: {
        code: z.string(),
        timeout: z.number().optional(),
        use_gel_client: z.boolean().optional(),
        instance: z.string().optional(),
        branch: z.string().optional(),
      }
    },
    async (args) => {
      try {
        const timeout = args.timeout || 10000; // Increase default timeout to 10 seconds
        const gelClient = args.use_gel_client === false ? undefined : getDatabaseClient({ instance: args.instance, branch: args.branch });
        
        // Create a context with all necessary globals
        const context = {
          gelClient,
          console,
          require,
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
          Promise,
          Buffer,
          process: { env: process.env },
          global: {},
        } as any;
        
        // Wrap the code in an async function to handle await properly
        const wrappedCode = `
          (async () => {
            try {
              ${args.code}
            } catch (error) {
              console.error('Execution error:', error.message);
              throw error;
            }
          })()
        `;
        
        const script = new vm.Script(wrappedCode);
        
        // Execute with timeout
        const result = await Promise.race([
          script.runInNewContext(context, { timeout }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Execution timed out')), timeout)
          )
        ]);
        
        return { 
          content: [{ 
            type: 'text', 
            text: result !== undefined ? JSON.stringify(result, null, 2) : 'Code executed successfully (no return value)' 
          }] 
        };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Error executing TypeScript: ${error.message}` }] };
      }
    }
  );
}
