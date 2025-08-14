import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fuse from "fuse.js";
import { z } from "zod";
import { findProjectRoot } from "../database.js";

// Local use of escapeRegExp
import { escapeRegExp } from "../lib/regex.js";

export function registerSearchDocs(server: McpServer) {
	server.registerTool(
		"search_gel_docs",
		{
			title: "Search Gel Documentation",
			description:
				"Performs a fuzzy search over the local Gel documentation file (`gel_llm.txt`). Supports 'match_all_terms' and 'context_lines' expansion around matches.",
			inputSchema: {
				search_term: z.string(),
				context_lines: z.number().optional().default(3),
				match_all_terms: z.boolean().optional().default(false),
			},
		},
		async (args) => {
			// Use the project root finder
			const projectRoot = findProjectRoot();
			const possiblePaths = [
				path.join(projectRoot, "gel_llm.txt"),
				path.join(__dirname, "..", "..", "gel_llm.txt"), // from build/tools to project root
				path.join(process.cwd(), "gel_llm.txt"),
				"./gel_llm.txt",
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
							type: "text" as const,
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
					threshold: 0.6, // Higher threshold = more lenient matching
					includeScore: true,
					includeMatches: true,
					minMatchCharLength: 2,
				});

				// Build search queries
				let results = fuse.search(args.search_term);
				if (args.match_all_terms) {
					const terms = args.search_term
						.split(/\s+/)
						.map((t) => t.trim())
						.filter(Boolean);
					const perTermResults = terms.map(
						(term) => new Set(fuse.search(term).map((r) => r.item.id)),
					);
					const intersection = perTermResults.reduce<Set<number>>(
						(acc, set) => {
							if (acc.size === 0) return new Set(set);
							return new Set([...acc].filter((id) => set.has(id)));
						},
						new Set(),
					);
					// Filter original result list to those in intersection to preserve scoring
					results = results.filter((r) => intersection.has(r.item.id));
				}

				if (results.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
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
					const context = args.context_lines ?? 3;

					// Determine best matching lines within the chunk for context centering
					const lines = chunk.content.split("\n");
					const termRegex = new RegExp(escapeRegExp(args.search_term), "i");
					const hitIndices: number[] = [];
					lines.forEach((line, idx) => {
						if (termRegex.test(line)) hitIndices.push(idx);
					});

					const sections: Array<{ start: number; end: number }> = [];
					if (hitIndices.length === 0) {
						sections.push({ start: 0, end: lines.length - 1 });
					} else {
						for (const idx of hitIndices) {
							const s = Math.max(0, idx - context);
							const e = Math.min(lines.length - 1, idx + context);
							sections.push({ start: s, end: e });
						}
					}

					// Merge overlapping sections
					sections.sort((a, b) => a.start - b.start);
					const merged: Array<{ start: number; end: number }> = [];
					for (const sec of sections) {
						const last = merged[merged.length - 1];
						if (!last || sec.start > last.end + 1) merged.push({ ...sec });
						else last.end = Math.max(last.end, sec.end);
					}

					output += `📄 **Match ${chunk.id + 1}** (lines ${chunk.startLine + 1}-${chunk.endLine + 1}, relevance: ${score.toFixed(1)}%)\n`;
					for (const sec of merged) {
						output += "```\n";
						for (let i = sec.start; i <= sec.end; i++) {
							const lineNum = chunk.startLine + i + 1;
							const line = lines[i];
							output += `${lineNum.toString().padStart(4)}: ${line}\n`;
						}
						output += "```\n\n";
					}
				}

				return { content: [{ type: "text" as const, text: output }] };
			} catch (error: unknown) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error searching documentation: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
				};
			}
		},
	);
}
