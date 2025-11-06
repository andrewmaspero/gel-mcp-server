import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface ReplaceBuildToolResponseOptions {
	placeholderComment?: string;
}

export interface ReplaceBuildToolResponseStats {
	replacedCalls: number;
	addedDataPlaceholders: number;
	updatedImports: number;
}

export interface ReplaceBuildToolResponseResult {
	changed: boolean;
	outputText: string;
	stats: ReplaceBuildToolResponseStats;
}

const DEFAULT_PLACEHOLDER_COMMENT = " TODO: populate structuredContent payload ";

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

function hasDataProperty(node: ts.ObjectLiteralExpression): boolean {
	return node.properties.some((prop) => {
		if (
			ts.isPropertyAssignment(prop) ||
			ts.isShorthandPropertyAssignment(prop)
		) {
			const name = prop.name;
			return name && ts.isIdentifier(name) && name.text === "data";
		}

		return false;
	});
}

function getImportSpecifierName(specifier: ts.ImportSpecifier): string {
	return specifier.name.text;
}

function createDataPlaceholder(comment: string): ts.PropertyAssignment {
	const initializer = ts.addSyntheticLeadingComment(
		ts.factory.createObjectLiteralExpression([], true),
		ts.SyntaxKind.MultiLineCommentTrivia,
		comment,
		true,
	);

	return ts.factory.createPropertyAssignment(
		ts.factory.createIdentifier("data"),
		initializer,
	);
}

export function transformBuildToolResponse(
	sourceText: string,
	filePath: string,
	options: ReplaceBuildToolResponseOptions = {},
): ReplaceBuildToolResponseResult {
	const placeholderComment =
		options.placeholderComment ?? DEFAULT_PLACEHOLDER_COMMENT;

	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	let replacedCalls = 0;
	let addedDataPlaceholders = 0;
	let updatedImports = 0;

	const callTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
		const { factory } = context;
		const visitor: ts.Visitor = (node) => {
			if (ts.isCallExpression(node) && isBuildToolResponseCall(node)) {
				replacedCalls += 1;

				const expression = node.expression;
				let updatedExpression: ts.Expression;
				if (ts.isIdentifier(expression)) {
					updatedExpression = factory.createIdentifier(
						"buildStructuredResponse",
					);
				} else if (ts.isPropertyAccessExpression(expression)) {
					updatedExpression = factory.updatePropertyAccessExpression(
						expression,
						expression.expression,
						factory.createIdentifier("buildStructuredResponse"),
					);
				} else {
					updatedExpression = expression;
				}

				const args = [...node.arguments];
				if (args.length > 0 && ts.isObjectLiteralExpression(args[0])) {
					const objectLiteral = args[0];
					let properties = [...objectLiteral.properties];

					if (!hasDataProperty(objectLiteral)) {
						const dataProperty = createDataPlaceholder(
							placeholderComment,
						);
						properties = [...properties, dataProperty];
						addedDataPlaceholders += 1;
					}

					const updatedObject = factory.updateObjectLiteralExpression(
						objectLiteral,
						properties,
					);
					args[0] = updatedObject;
				}

				return factory.updateCallExpression(
					node,
					updatedExpression,
					node.typeArguments,
					args,
				);
			}

			return ts.visitEachChild(node, visitor, context);
		};

		return (node) => ts.visitNode(node, visitor) as ts.SourceFile;
	};

	const transformed = ts.transform(sourceFile, [callTransformer]);
	let transformedSource = transformed.transformed[0] as ts.SourceFile;
	transformed.dispose();

	if (replacedCalls > 0) {
		const importTransformer: ts.TransformerFactory<ts.SourceFile> = (
			context,
		) => {
			const { factory } = context;
			const visitor: ts.Visitor = (node) => {
				if (
					ts.isImportDeclaration(node) &&
					ts.isStringLiteral(node.moduleSpecifier) &&
					(node.moduleSpecifier.text.endsWith("../utils.js") ||
						node.moduleSpecifier.text.endsWith("../utils"))
				) {
					const clause = node.importClause;
					if (
						clause?.namedBindings &&
						ts.isNamedImports(clause.namedBindings)
					) {
						const originalElements =
							clause.namedBindings.elements;
						const filtered = originalElements.filter(
							(specifier) =>
								getImportSpecifierName(specifier) !==
								"buildToolResponse",
						);

						const hasStructured = filtered.some(
							(specifier) =>
								getImportSpecifierName(specifier) ===
								"buildStructuredResponse",
						);

						let changed = filtered.length !== originalElements.length;

						if (!hasStructured) {
							filtered.push(
								factory.createImportSpecifier(
									false,
									undefined,
									factory.createIdentifier(
										"buildStructuredResponse",
									),
								),
							);
							changed = true;
						}

						if (changed) {
							const sorted = filtered.sort((a, b) =>
								getImportSpecifierName(a).localeCompare(
									getImportSpecifierName(b),
								),
							);
							const namedImports =
								factory.updateNamedImports(
									clause.namedBindings,
									sorted,
								);
							const updatedClause = factory.updateImportClause(
								clause,
								clause.isTypeOnly,
								clause.name,
								namedImports,
							);
							updatedImports += 1;
							return factory.updateImportDeclaration(
								node,
								node.modifiers,
								updatedClause,
								node.moduleSpecifier,
								node.assertClause,
							);
						}
					}
				}

				return ts.visitEachChild(node, visitor, context);
			};

			return (node) => ts.visitNode(node, visitor) as ts.SourceFile;
		};

		const importTransformed = ts.transform(
			transformedSource,
			[importTransformer],
		);
		transformedSource = importTransformed.transformed[0] as ts.SourceFile;
		importTransformed.dispose();
	}

	const printer = ts.createPrinter({
		newLine: ts.NewLineKind.LineFeed,
	});
	const outputText = printer.printFile(transformedSource);

	const changed =
		replacedCalls > 0 || addedDataPlaceholders > 0 || updatedImports > 0;

	return {
		changed,
		outputText,
		stats: {
			replacedCalls,
			addedDataPlaceholders,
			updatedImports,
		},
	};
}

export function transformFileInPlace(
	filePath: string,
	options: ReplaceBuildToolResponseOptions = {},
): ReplaceBuildToolResponseResult {
	const absolutePath = path.resolve(filePath);
	const source = fs.readFileSync(absolutePath, "utf8");
	const result = transformBuildToolResponse(source, absolutePath, options);
	if (result.changed) {
		fs.writeFileSync(absolutePath, `${result.outputText}\n`, "utf8");
	}
	return result;
}
