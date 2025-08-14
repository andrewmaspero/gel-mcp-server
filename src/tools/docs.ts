import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerSearchDocs } from "./searchGelDocs.js";

// Thin façade to keep a single entry point (docs.search).
export function registerDocs(server: McpServer) {
	server.registerTool(
		"docs",
		{
			title: "Docs (Search)",
			description: "Documentation utilities. Actions: 'search' (default).",
			inputSchema: {
				action: z.enum(["search"]).optional(),
				term: z.string().optional(),
				context_lines: z.number().optional(),
				match_all_terms: z.boolean().optional(),
			},
		},
		async (args, _context) => {
			// Delegate to existing search tool for now
			if (!args.term) {
				return {
					content: [
						{
							type: "text" as const,
							text: "❌ Missing 'term' for docs.search",
						},
					],
				};
			}
			// Directly invoke the underlying tool by returning the tool call text
			return {
				content: [
					{
						type: "text" as const,
						text: `@[search_gel_docs search_term="${args.term}"${
							args.context_lines ? ` context_lines="${args.context_lines}"` : ""
						}${
							typeof args.match_all_terms === "boolean"
								? ` match_all_terms="${args.match_all_terms}"`
								: ""
						}]`,
					},
				],
			};
		},
	);
	// Keep original search tool available
	registerSearchDocs(server);
}
