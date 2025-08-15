import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Fuse from "fuse.js";
import { z } from "zod";
import { findProjectRoot } from "../database.js";
import { escapeRegExp } from "../lib/regex.js";

export function registerDocs(server: McpServer) {
	// Memoized doc index
	let cachedDocPath: string | null = null;
	let cachedMtimeMs: number | null = null;
	let cachedFuse: Fuse<{
		id: number;
		content: string;
		startLine: number;
		endLine: number;
	}> | null = null;

	function buildOrReuseIndex(docFilePath: string) {
		const stat = fs.statSync(docFilePath);
		const mtimeMs = stat.mtimeMs;
		if (
			cachedDocPath === docFilePath &&
			cachedMtimeMs === mtimeMs &&
			cachedFuse
		) {
			return cachedFuse;
		}
		const fileContent = fs.readFileSync(docFilePath, "utf8");
		const fileLines = fileContent.split("\n");
		const chunkSize = 20;
		const chunks: Array<{
			id: number;
			content: string;
			startLine: number;
			endLine: number;
		}> = [];
		for (let i = 0; i < fileLines.length; i += chunkSize) {
			const content = fileLines.slice(i, i + chunkSize).join("\n");
			if (content.trim().length > 0) {
				chunks.push({
					id: chunks.length,
					content,
					startLine: i,
					endLine: Math.min(i + chunkSize - 1, fileLines.length - 1),
				});
			}
		}
		cachedDocPath = docFilePath;
		cachedMtimeMs = mtimeMs;
		cachedFuse = new Fuse(chunks, {
			keys: ["content"],
			threshold: 0.6,
			includeScore: true,
			includeMatches: true,
			minMatchCharLength: 2,
		});
		return cachedFuse;
	}
	server.registerTool(
		"docs",
		{
			title: "Docs (Search)",
			description: "Documentation utilities. Actions: 'search' (default).",
			inputSchema: {
				action: z.enum(["search"]).optional(),
				term: z.string().optional(),
				context_lines: z.number().optional().default(3),
				match_all_terms: z.boolean().optional().default(false),
			},
		},
		async (args) => {
			const action = args.action ?? "search";
			if (action !== "search") {
				return {
					content: [{ type: "text", text: "❌ Unsupported docs action" }],
				};
			}
			if (!args.term) {
				return { content: [{ type: "text", text: "❌ Missing 'term'" }] };
			}

			const projectRoot = findProjectRoot();
			const possiblePaths = [
				path.join(projectRoot, "gel_llm.txt"),
				path.join(__dirname, "..", "..", "gel_llm.txt"),
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
							type: "text",
							text: `Documentation file not found. Searched: ${possiblePaths.join(", ")}`,
						},
					],
				};
			}

			const fuse = buildOrReuseIndex(docFilePath);

			let results = fuse.search(args.term);
			if (args.match_all_terms) {
				const terms = args.term
					.split(/\s+/)
					.map((t) => t.trim())
					.filter(Boolean);
				const perTerm = terms.map(
					(term) => new Set(fuse.search(term).map((r) => r.item.id)),
				);
				const intersection = perTerm.reduce<Set<number>>((acc, set) => {
					if (acc.size === 0) return new Set(set);
					return new Set([...acc].filter((id) => set.has(id)));
				}, new Set());
				results = results.filter((r) => intersection.has(r.item.id));
			}
			if (results.length === 0) {
				return {
					content: [
						{ type: "text", text: `No matches found for "${args.term}".` },
					],
				};
			}

			const topResults = results.slice(0, 5);
			let output = `Found ${results.length} matches for "${args.term}" (showing top ${topResults.length}):\n\n`;
			const contextLines = args.context_lines ?? 3;
			for (const r of topResults) {
				const chunk = r.item;
				const score = r.score ? (1 - r.score) * 100 : 100;
				const lines = chunk.content.split("\n");
				const termRegex = new RegExp(escapeRegExp(args.term), "i");
				const hitIdx: number[] = [];
				lines.forEach((line, idx) => {
					if (termRegex.test(line)) hitIdx.push(idx);
				});
				const sections: Array<{ start: number; end: number }> = [];
				if (hitIdx.length === 0)
					sections.push({ start: 0, end: lines.length - 1 });
				else
					for (const idx of hitIdx)
						sections.push({
							start: Math.max(0, idx - contextLines),
							end: Math.min(lines.length - 1, idx + contextLines),
						});
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
						output += `${lineNum.toString().padStart(4)}: ${lines[i]}\n`;
					}
					output += "```\n\n";
				}
			}
			return { content: [{ type: "text" as const, text: output }] };
		},
	);
}
