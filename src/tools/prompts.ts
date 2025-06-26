import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer) {
  // A tool that formats a code review prompt
  server.registerTool(
    'prompt-code-review',
    {
      title: 'Generate Code Review Prompt',
      description: 'Generate a detailed prompt to have the LLM review a snippet of code.',
      inputSchema: {
        code: z.string(),
      }
    },
    async (args) => ({
      content: [
        {
          type: 'text',
          text: `Here is a prompt to begin a code review:\n\nPlease review this code for best practices, potential bugs, and possible improvements:\n\n\`\`\`\n${args.code}\n\`\`\``,
        },
      ],
    })
  );

  // A tool that formats a search documentation prompt
  server.registerTool(
    'prompt-search-docs',
    {
      title: 'Generate Search Documentation Tool Call',
      description: 'Generate a tool call to search the Gel documentation for a specific term.',
      inputSchema: {
        term: z.string(),
      }
    },
    async (args) => ({
      content: [
        {
          type: 'text',
          text: `Here is the tool call to search the documentation:\n\n@[search_gel_docs search_term="${args.term}"]`,
        },
      ],
    })
  );

  // A tool that formats a run EdgeQL query prompt
  server.registerTool(
    'prompt-run-edgeql',
    {
      title: 'Generate EdgeQL Query Tool Call',
      description: 'Generate a tool call to execute an EdgeQL query against a specific instance and branch.',
      inputSchema: {
        query: z.string(),
        instance: z.string().optional(),
        branch: z.string().optional(),
      }
    },
    async (args) => {
      let toolCall = `@[execute-edgeql query="${args.query}"`;
      if (args.instance) {
        toolCall += ` instance="${args.instance}"`;
      }
      if (args.branch) {
        toolCall += ` branch="${args.branch}"`;
      }
      toolCall += `]`;
      return {
        content: [
          {
            type: 'text',
            text: `Here is the tool call to run your query:\n\n${toolCall}`,
          },
        ],
      };
    }
  );
} 