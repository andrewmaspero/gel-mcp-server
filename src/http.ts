import fastify from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApp } from './app.js';
import { initGelClient, closeAllConnections } from './database.js';
import { randomUUID } from 'crypto';
import * as z from 'zod/v4';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

async function main() {
  const server = fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // Add schema validator and serializer
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  const mcpServer = createApp();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
  });
  await mcpServer.connect(transport);

  const mcpRequestSchema = z.object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.any().optional(),
    id: z.union([z.string(), z.number(), z.null()]).optional(),
  });

  const handleMcpRequest = async (req: any, reply: any) => {
    try {
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      server.log.error(err, 'Error handling MCP request');
      if (!reply.sent) {
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  };

  server.post(
    '/mcp',
    { schema: { body: mcpRequestSchema } },
    handleMcpRequest
  );
  server.get('/mcp', handleMcpRequest);
  server.delete('/mcp', handleMcpRequest);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  server.addHook('onClose', async () => {
    console.error('Shutting down server...');
    await closeAllConnections();
    await transport.close();
  });

  await server.listen({ port });
  await initGelClient();
}

main().catch((err) => {
  console.error('Fatal error in main():', err);
  process.exit(1);
}); 