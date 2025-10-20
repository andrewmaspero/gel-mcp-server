import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
	transformBuildToolResponse,
	type ReplaceBuildToolResponseOptions,
} from "../../src/codemods/replaceBuildToolResponse.js";

interface CLIOptions extends ReplaceBuildToolResponseOptions {
	write: boolean;
	targets: string[];
}

function parseArgs(argv: string[]): CLIOptions {
	const write = argv.includes("--write");
	const placeholderIndex = argv.indexOf("--placeholder-comment");
	let placeholderComment: string | undefined;
	if (placeholderIndex !== -1 && argv[placeholderIndex + 1]) {
		placeholderComment = argv[placeholderIndex + 1];
	}

	const targets = argv.filter((arg) => !arg.startsWith("--"));
	return {
		write,
		targets: targets.length > 0 ? targets : ["src/tools"],
		placeholderComment,
	};
}

function collectFiles(target: string): string[] {
	const absolute = path.resolve(target);
	if (!fs.existsSync(absolute)) {
		return [];
	}

	const stats = fs.statSync(absolute);
	if (stats.isFile()) {
		return absolute.endsWith(".ts") ? [absolute] : [];
	}

	const entries = fs.readdirSync(absolute, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const resolved = path.join(absolute, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(resolved));
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			files.push(resolved);
		}
	}
	return files;
}

function ensureTrailingNewline(content: string): string {
	return content.endsWith("\n") ? content : `${content}\n`;
}

async function main() {
	const args = process.argv.slice(2);
	const options = parseArgs(args);
	const files = options.targets.flatMap((target) => collectFiles(target));

	if (files.length === 0) {
		// eslint-disable-next-line no-console -- CLI feedback
		console.log("No TypeScript files matched the provided targets.");
		return;
	}

	const summaries: Array<{ file: string; stats: number }> = [];
	let totalReplaced = 0;
	let totalPlaceholders = 0;
	let totalImports = 0;

	for (const file of files) {
		const source = fs.readFileSync(file, "utf8");
		const result = transformBuildToolResponse(source, file, {
			placeholderComment: options.placeholderComment,
		});
		if (result.changed) {
			totalReplaced += result.stats.replacedCalls;
			totalPlaceholders += result.stats.addedDataPlaceholders;
			totalImports += result.stats.updatedImports;
			summaries.push({
				file,
				stats: result.stats.replacedCalls,
			});

			if (options.write) {
				fs.writeFileSync(
					file,
					ensureTrailingNewline(result.outputText),
					"utf8",
				);
			}
		}
	}

	if (summaries.length === 0) {
		// eslint-disable-next-line no-console -- CLI feedback
		console.log("No buildToolResponse calls found.");
		return;
	}

	const relative = (file: string) =>
		path.relative(process.cwd(), file) || file;

	if (options.write) {
		// eslint-disable-next-line no-console -- CLI feedback
		console.log(
			`Updated ${summaries.length} file(s); rewrote ${totalReplaced} call(s), inserted ${totalPlaceholders} placeholder(s), adjusted ${totalImports} import(s).`,
		);
		return;
	}

	// eslint-disable-next-line no-console -- CLI feedback
	console.log("Files requiring codemod:");
	for (const entry of summaries) {
		// eslint-disable-next-line no-console -- CLI feedback
		console.log(` - ${relative(entry.file)} (${entry.stats} call(s))`);
	}
	process.exitCode = 1;
}

main().catch((error) => {
	// eslint-disable-next-line no-console -- CLI feedback
	console.error(error);
	process.exitCode = 1;
});
