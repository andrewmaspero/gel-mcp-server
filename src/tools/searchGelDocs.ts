import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs';
import path from 'path';

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function registerSearchDocs(server: McpServer) {
  server.tool(
    'search_gel_docs',
    'Search the Gel documentation for specific terms or patterns.',
    {
      search_term: z.string().describe('The term or pattern to search for'),
      context_lines: z.number().optional().describe('Number of context lines to show (default 5)'),
      match_all_terms: z.boolean().optional().describe('If true, match all terms in a multi-word query'),
    },
    async (args) => {
      const possiblePaths = [
        path.join(__dirname, '..', 'gel_llm.txt'),
        path.join(process.cwd(), 'gel_llm.txt'),
        './gel_llm.txt',
      ];
      let docFilePath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) { docFilePath = p; break; }
      }
      if (!docFilePath) {
        return { content: [{ type: 'text', text: 'Documentation file not found.' }] };
      }
      const fileLines = fs.readFileSync(docFilePath, 'utf8').split('\n');
      const context = args.context_lines ?? 5;
      const terms = args.match_all_terms && args.search_term.includes(' ')
        ? args.search_term.split(/\s+/).map(t => escapeRegExp(t))
        : [escapeRegExp(args.search_term)];
      const regexes = terms.map(t => new RegExp(t, 'i'));
      const matches: Array<{line: number, content: string}> = [];
      fileLines.forEach((line, idx) => {
        if (regexes.every(r => r.test(line))) {
          matches.push({ line: idx, content: line });
        }
      });
      if (matches.length === 0) {
        return { content: [{ type: 'text', text: 'No matches found.' }] };
      }
      let output = `Found ${matches.length} matches for "${args.search_term}":\n\n`;
      for (const match of matches) {
        const start = Math.max(0, match.line - context);
        const end = Math.min(fileLines.length - 1, match.line + context);
        for (let i = start; i <= end; i++) {
          const prefix = i === match.line ? '> ' : '  ';
          output += `${prefix}${i + 1}: ${fileLines[i]}\n`;
        }
        output += '\n---\n';
      }
      return { content: [{ type: 'text', text: output }] };
    }
  );
}
