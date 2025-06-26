import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApp } from './app.js';
import { initGelClient, closeAllConnections } from './database.js';

async function main() {
  const server = createApp();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await initGelClient();
  console.error('Gel MCP Server running on stdio');

  const shutdown = async () => {
    console.log('Shutting down server...');
    await closeAllConnections();
    await transport.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error in main():', err);
  process.exit(1);
});
