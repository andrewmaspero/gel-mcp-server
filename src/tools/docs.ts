import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import Fuse from "fuse.js";
import { z } from "zod";
import { findProjectRoot } from "../database.js";
import { escapeRegExp } from "../lib/regex.js";
import { MAX_INLINE_RESPONSE_CHARS } from "../constants.js";
import { createEphemeralTextResource } from "../resources/index.js";
import { buildStructuredResponse } from "../utils.js";
import { DocsResponseSchema } from "../types/docs.js";

const MAX_SNIPPET_LENGTH = 800;

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
			outputSchema: DocsResponseSchema.shape,
		},
	async (args): Promise<CallToolResult> => {
		const action = args.action ?? "search";
		if (action !== "search") {
			return buildStructuredResponse({
				status: "error",
				title: "Unsupported docs action",
				textSections: ["Only the 'search' action is currently supported."],
				data: {
					status: "error",
					message: "Unsupported action",
					result: { term: args.term ?? "", totalMatches: 0, returned: 0, matches: [] },
				},
			}) as unknown as CallToolResult;
		}
		if (!args.term) {
			return buildStructuredResponse({
				status: "error",
				title: "Missing 'term'",
				textSections: ["Provide a search term, e.g. @[docs term=\"sampling\"]."],
				data: {
					status: "error",
					message: "Search term required",
					result: { term: "", totalMatches: 0, returned: 0, matches: [] },
				},
			}) as unknown as CallToolResult;
		}
		const term = args.term as string;

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
			return buildStructuredResponse({
				status: "error",
				title: "Documentation file not found",
				textSections: [
					`Searched the following locations: ${possiblePaths.join(", ")}`,
					"Ensure `gel_llm.txt` exists or update the docs path.",
				],
				data: {
					status: "error",
					message: "Docs file missing",
					result: { term, totalMatches: 0, returned: 0, matches: [] },
				},
			}) as unknown as CallToolResult;
		}

		const resolvedDocPath = docFilePath;
		const fuse = buildOrReuseIndex(resolvedDocPath);

		let results = fuse.search(term);
		if (args.match_all_terms) {
			const terms = term
				.split(/\s+/)
				.map((t) => t.trim())
				.filter(Boolean);
			const perTerm = terms.map((termValue) =>
				new Set(fuse.search(termValue).map((r) => r.item.id)),
			);
			const intersection = new Set<number>();
			for (const set of perTerm) {
				if (intersection.size === 0) {
					for (const id of set) {
						intersection.add(id);
					}
				} else {
					for (const id of Array.from(intersection)) {
						if (!set.has(id)) {
							intersection.delete(id);
						}
					}
				}
			}
			results = results.filter((r) => intersection.has(r.item.id));
		}
		if (results.length === 0) {
			return buildStructuredResponse({
				status: "info",
				title: `No matches for "${term}"`,
				textSections: [
					"Try refining your query or searching with fewer terms.",
					"Example: @[docs term=\"connection auto\"]",
				],
				data: {
					status: "ok",
					message: `No matches for ${term}`,
					result: { term, totalMatches: 0, returned: 0, matches: [] },
				},
			}) as unknown as CallToolResult;
		}

			const topResults = results.slice(0, 5);
			const contextLines = args.context_lines ?? 3;
		const matches = topResults.map((r) => {
			const chunk = r.item;
			const lines = chunk.content.split("\n");
			const termRegex = new RegExp(escapeRegExp(term), "i");
				const hitIdx: number[] = [];
				lines.forEach((line, idx) => {
					if (termRegex.test(line)) hitIdx.push(idx);
				});
				const sections: Array<{ start: number; end: number }> = [];
				if (hitIdx.length === 0) {
					sections.push({ start: 0, end: lines.length - 1 });
				} else {
					for (const idx of hitIdx) {
						sections.push({
							start: Math.max(0, idx - contextLines),
							end: Math.min(lines.length - 1, idx + contextLines),
						});
					}
				}
				sections.sort((a, b) => a.start - b.start);
				const merged: Array<{ start: number; end: number }> = [];
				for (const sec of sections) {
					const last = merged[merged.length - 1];
					if (!last || sec.start > last.end + 1) merged.push({ ...sec });
					else last.end = Math.max(last.end, sec.end);
				}
				let snippet = "";
				for (const sec of merged) {
					for (let i = sec.start; i <= sec.end; i++) {
						const lineNum = chunk.startLine + i + 1;
						snippet += `${lineNum.toString().padStart(4)}: ${lines[i]}\n`;
					}
					snippet += "\n";
				}
				const trimmedSnippet = snippet.trimEnd();
				const truncated = trimmedSnippet.length > MAX_SNIPPET_LENGTH;
			const preview = truncated
				? `${trimmedSnippet.slice(0, MAX_SNIPPET_LENGTH)}\n…`
				: trimmedSnippet;
				const resourceUri = truncated
					? createEphemeralTextResource(trimmedSnippet, {
							mimeType: "text/plain",
						})
					: undefined;
				const score = r.score ? (1 - r.score) * 100 : 100;
			return {
				id: chunk.id + 1,
				filePath: resolvedDocPath,
					startLine: chunk.startLine + 1,
					endLine: chunk.endLine + 1,
					score,
					snippet: preview,
					truncated: truncated || undefined,
					resourceUri,
				};
			});

		const resourceLinks = matches
			.filter((match) => typeof match.resourceUri === "string")
			.map((match) => ({
				type: "resource_link" as const,
				uri: match.resourceUri as string,
				name: `docs.match.${match.id}`,
				title: `Docs match ${match.id}`,
				description: `Full snippet for documentation search match ${match.id}.`,
				mimeType: "text/plain",
			}));

			const serializedMatches = JSON.stringify(matches);
			const truncated = serializedMatches.length > MAX_INLINE_RESPONSE_CHARS;
		const summary = [
			`Found ${results.length} matches for "${term}" (showing top ${matches.length}).`,
			...(resourceLinks.length > 0
				? [
					`Some snippets trimmed to ${MAX_SNIPPET_LENGTH} characters; use resource links for full context.`,
				]
				: []),
		];

		return buildStructuredResponse({
			status: "success",
			title: `Documentation search results`,
			textSections: summary,
			nextSteps: [
				"Use @[docs term=\"...\"] with narrower keywords to refine results.",
				"After identifying relevant snippets, reference schema or query tools for deeper analysis.",
			],
			truncated,
			jsonPreviewLimit: MAX_INLINE_RESPONSE_CHARS,
			resourceLinks: resourceLinks.length ? resourceLinks : undefined,
			data: {
				status: "ok",
				message: `Matches for "${term}"`,
				result: {
					term,
					totalMatches: results.length,
					returned: matches.length,
					matches,
				},
			},
		}) as unknown as CallToolResult;
	},
	);
}
