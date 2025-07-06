import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fuse from "fuse.js";
import { z } from "zod";

export function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function registerSearchDocs(server: McpServer) {
	server.registerTool(
		"search_gel_docs",
		{
			title: "Search Gel Documentation",
			description:
				"Performs a fuzzy search over the local Gel documentation file (`gel_llm.txt`). Use this to find information about Gel features, API usage, EdgeQL syntax, and concepts.",
			inputSchema: {
				search_term: z.string(),
				context_lines: z.number().optional(),
				match_all_terms: z.boolean().optional(),
			},
		},
		async (args) => {
			// Try to find the project root directory
			const projectRoot = process.env.PWD || process.cwd();
			const possiblePaths = [
				path.join(projectRoot, "gel_llm.txt"),
				path.join(__dirname, "..", "..", "gel_llm.txt"), // from build/tools to project root
				path.join(process.cwd(), "gel_llm.txt"),
				"./gel_llm.txt",
				"/Users/andreamaspero/Projects/personal/gel-mcp-server/gel_llm.txt", // absolute fallback
			];

			let docFilePath: string | null = null;
			for (const p of possiblePaths) {
				if (fs.existsSync(p)) {
					docFilePath = p;
					break;
				}
			}

			if (!docFilePath) {
				return {
					content: [
						{
							type: "text",
							text: `Documentation file not found. Searched paths: ${possiblePaths.join(", ")}`,
						},
					],
				};
			}

			try {
				const fileContent = fs.readFileSync(docFilePath, "utf8");
				const fileLines = fileContent.split("\n");

				// Create chunks of text for better search results
				const chunkSize = 20; // lines per chunk
				const chunks: Array<{
					id: number;
					content: string;
					startLine: number;
					endLine: number;
				}> = [];

				for (let i = 0; i < fileLines.length; i += chunkSize) {
					const chunkLines = fileLines.slice(i, i + chunkSize);
					const content = chunkLines.join("\n");
					if (content.trim().length > 0) {
						chunks.push({
							id: chunks.length,
							content,
							startLine: i,
							endLine: Math.min(i + chunkSize - 1, fileLines.length - 1),
						});
					}
				}

				// Use Fuse.js for fuzzy search
				const fuse = new Fuse(chunks, {
					keys: ["content"],
					threshold: 0.3, // Lower threshold = more strict matching
					includeScore: true,
					includeMatches: true,
					minMatchCharLength: 3,
				});

				const results = fuse.search(args.search_term);

				if (results.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `No matches found for "${args.search_term}".`,
							},
						],
					};
				}

				// Limit results to top 5 matches
				const topResults = results.slice(0, 5);
				let output = `Found ${results.length} matches for "${args.search_term}" (showing top ${topResults.length}):\n\n`;

				for (const result of topResults) {
					const chunk = result.item;
					const score = result.score ? (1 - result.score) * 100 : 100;

					output += `📄 **Match ${chunk.id + 1}** (lines ${chunk.startLine + 1}-${chunk.endLine + 1}, relevance: ${score.toFixed(1)}%)\n`;
					output += "```\n";

					// Add line numbers to the chunk content
					const chunkLines = chunk.content.split("\n");
					chunkLines.forEach((line, idx) => {
						const lineNum = chunk.startLine + idx + 1;
						output += `${lineNum.toString().padStart(4)}: ${line}\n`;
					});

					output += "```\n\n";
				}

				return { content: [{ type: "text", text: output }] };
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text",
							text: `Error searching documentation: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
