import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './server.js';
import { initGelClient } from './database.js';
import { registerTools } from './tools/index.js';

async function main() {
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await initGelClient();
  console.error('Gel MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error in main():', err);
  process.exit(1);
});
