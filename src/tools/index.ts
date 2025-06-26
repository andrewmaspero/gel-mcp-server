import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerExecuteEdgeql } from './executeEdgeql.js';
import { registerDescribeSchema } from './describeSchema.js';
import { registerValidateQuery } from './validateQuery.js';
import { registerExecuteTypescript } from './executeTypescript.js';
import { registerSearchDocs } from './searchGelDocs.js';
import { registerRefreshSchema } from './refreshSchema.js';

export function registerTools(server: McpServer) {
  registerExecuteEdgeql(server);
  registerDescribeSchema(server);
  registerValidateQuery(server);
  registerExecuteTypescript(server);
  registerSearchDocs(server);
  registerRefreshSchema(server);
}
