import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface BuildToolResponseCallSite {
	line: number;
	column: number;
	functionName?: string;
}

export interface BuildToolResponseAuditEntry {
	file: string;
	toolName: string;
	calls: BuildToolResponseCallSite[];
}

interface CollectOptions {
	toolsDir?: string;
}

function isBuildToolResponseCall(node: ts.CallExpression): boolean {
	const expression = node.expression;
	if (ts.isIdentifier(expression)) {
		return expression.text === "buildToolResponse";
	}

	if (ts.isPropertyAccessExpression(expression)) {
		return expression.name.text === "buildToolResponse";
	}

	return false;
}

function getEnclosingFunctionName(node: ts.Node): string | undefined {
	let current: ts.Node | undefined = node;
	while (current) {
		if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
			const identifier = current.name;
			if (!identifier) {
				return undefined;
			}

			if (
				ts.isIdentifier(identifier) ||
				ts.isStringLiteralLike(identifier) ||
				ts.isNumericLiteral(identifier)
			) {
				return identifier.text;
			}
		}

		if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
			const parent = current.parent;
			if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
				return parent.name.text;
			}

			if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
				return parent.name.text;
			}

			if (ts.isCallExpression(parent)) {
				const callee = parent.expression;
				if (ts.isPropertyAccessExpression(callee)) {
					return callee.name.text;
				}
			}
		}

		if (ts.isClassDeclaration(current) && current.name) {
			return current.name.text;
		}

		current = current.parent;
	}

	return undefined;
}

function collectToolFiles(dir: string): string[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const resolved = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectToolFiles(resolved));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".ts")) {
			files.push(resolved);
		}
	}

	return files;
}

export function collectBuildToolResponseCalls(
	options: CollectOptions = {},
): BuildToolResponseAuditEntry[] {
	const toolsDir = path.resolve(options.toolsDir ?? "src/tools");
	if (!fs.existsSync(toolsDir)) {
		throw new Error(`tools directory not found: ${toolsDir}`);
	}

	const toolFiles = collectToolFiles(toolsDir);
	const report: BuildToolResponseAuditEntry[] = [];

	for (const filePath of toolFiles) {
		const source = fs.readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			source,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);

		const calls: BuildToolResponseCallSite[] = [];

		function visit(node: ts.Node) {
			if (ts.isCallExpression(node) && isBuildToolResponseCall(node)) {
				const { line, character } = sourceFile.getLineAndCharacterOfPosition(
					node.getStart(sourceFile),
				);
				calls.push({
					line: line + 1,
					column: character + 1,
					functionName: getEnclosingFunctionName(node),
				});
			}
			ts.forEachChild(node, visit);
		}

		ts.forEachChild(sourceFile, visit);

		if (calls.length > 0) {
			report.push({
				file: path.relative(process.cwd(), filePath),
				toolName: path.basename(filePath, path.extname(filePath)),
				calls: calls.sort((a, b) => a.line - b.line || a.column - b.column),
			});
		}
	}

	return report.sort((a, b) => a.file.localeCompare(b.file));
}

export function writeBuildToolResponseReport(
	outputPath: string,
	options: CollectOptions = {},
) {
	const report = collectBuildToolResponseCalls(options);
	const dirname = path.dirname(outputPath);
	fs.mkdirSync(dirname, { recursive: true });
	fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return report;
}
