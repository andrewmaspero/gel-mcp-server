const fs = require("fs-extra");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		console.log(`Running: ${command} ${args.join(" ")}`);
		const child = spawn(command, args, {
			stdio: ["inherit", "pipe", "pipe"],
			...options,
		});

		let stdout = "";
		let stderr = "";

		if (child.stdout) {
			child.stdout.on("data", (data) => {
				stdout += data.toString();
				process.stdout.write(data);
			});
		}

		if (child.stderr) {
			child.stderr.on("data", (data) => {
				stderr += data.toString();
				process.stderr.write(data);
			});
		}

		child.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					new Error(`Command failed with exit code ${code}\nStderr: ${stderr}`),
				);
			}
		});

		child.on("error", reject);
	});
}

async function testConnection(credentialFile) {
	try {
		console.log(`Testing connection for ${credentialFile}...`);

		// Use a proper EdgeQL query to test connection
		await runCommand("gel", [
			"query",
			"--credentials-file",
			credentialFile,
			'SELECT "Connection test successful"',
		]);

		return true;
	} catch (error) {
		console.warn(
			`Connection test failed for ${credentialFile}:`,
			error.message,
		);
		return false;
	}
}

async function generateQueryBuilder(credentialFile, instanceName) {
	try {
		console.log(
			`Generating EdgeQL-JS query builder for instance: ${instanceName}`,
		);

		const outputDir = path.join("src", "edgeql-js", instanceName);
		await fs.ensureDir(outputDir);

		// Generate EdgeQL query builder using the gel generate command
		await runCommand("npx", [
			"@gel/generate",
			"edgeql-js",
			"--credentials-file",
			credentialFile,
			"--output-dir",
			outputDir,
			"--target",
			"ts",
			"--force-overwrite",
		]);

		// Verify that the query builder was actually generated
		const indexFile = path.join(outputDir, "index.ts");
		if (!fs.existsSync(indexFile)) {
			throw new Error("Query builder generation did not create index.ts file");
		}

		console.log(
			`✅ Query builder generated for ${instanceName} in ${outputDir}`,
		);
		return true;
	} catch (error) {
		console.error(
			`❌ Failed to generate query builder for ${instanceName}:`,
			error.message,
		);

		// Clean up the directory if generation failed
		try {
			const outputDir = path.join("src", "edgeql-js", instanceName);
			if (fs.existsSync(outputDir)) {
				await fs.remove(outputDir);
			}
		} catch (cleanupError) {
			console.warn(
				"Failed to cleanup after generation failure:",
				cleanupError.message,
			);
		}

		return false;
	}
}

async function createQueryBuilderIndex() {
	try {
		console.log("Creating query builder index file...");

		const edgeqlJsDir = path.join("src", "edgeql-js");
		const indexPath = path.join(edgeqlJsDir, "index.ts");

		if (!fs.existsSync(edgeqlJsDir)) {
			await fs.ensureDir(edgeqlJsDir);
		}

		// Scan for instance directories
		const instanceDirs = [];
		try {
			const files = fs.readdirSync(edgeqlJsDir);
			for (const file of files) {
				const fullPath = path.join(edgeqlJsDir, file);
				if (fs.statSync(fullPath).isDirectory()) {
					const instanceIndexPath = path.join(fullPath, "index.ts");
					if (fs.existsSync(instanceIndexPath)) {
						instanceDirs.push(file);
					}
				}
			}
		} catch (_error) {
			// Directory doesn't exist or is empty
		}

		if (instanceDirs.length === 0) {
			// Create a minimal fallback index
			const fallbackContent = `// Auto-generated query builder index
// No query builders available - add credential files to instance_credentials/ directory

export type InstanceName = never;

/**
 * Get a query builder for a specific instance
 * @param instanceName - The name of the instance (must match credential file name)
 * @returns The query builder module for the instance
 */
export async function getQueryBuilder(instanceName: never): Promise<never> {
  throw new Error('No query builders available. Add credential files to instance_credentials/ directory and run npm run generate-schemas');
}

/**
 * List all available instance names
 */
export function getAvailableInstances(): string[] {
  return [];
}
`;
			await fs.writeFile(indexPath, fallbackContent);
			console.log("Created fallback query builder index");
			return;
		}

		// Create an index that provides lazy loading of query builders to avoid conflicts
		let indexContent = `// Auto-generated query builder index
// Generated from instances: ${instanceDirs.join(", ")}
// 
// This index provides instance-specific query builders to avoid type conflicts
// when multiple databases have similar schemas.

export type InstanceName = ${instanceDirs.map((name) => `'${name}'`).join(" | ")};

/**
 * Get a query builder for a specific instance
 * @param instanceName - The name of the instance (must match credential file name)
 * @returns The query builder module for the instance
 */
export async function getQueryBuilder(instanceName: InstanceName) {
  switch (instanceName) {
`;

		// Add dynamic imports for each instance to avoid loading all at once
		for (const instanceName of instanceDirs) {
			indexContent += `    case '${instanceName}':
      return await import('./${instanceName}');
`;
		}

		indexContent += `    default:
      throw new Error(\`Unknown instance: \${instanceName}. Available instances: ${instanceDirs.join(", ")}\`);
  }
}

/**
 * Get a query builder for a specific instance (synchronous)
 * Use this when you're sure the query builder is already loaded
 * @param instanceName - The name of the instance
 * @returns The query builder module for the instance
 */
export function getQueryBuilderSync(instanceName: InstanceName) {
  switch (instanceName) {
`;

		// Add synchronous imports for each instance
		for (const instanceName of instanceDirs) {
			indexContent += `    case '${instanceName}':
      return require('./${instanceName}');
`;
		}

		indexContent += `    default:
      throw new Error(\`Unknown instance: \${instanceName}. Available instances: ${instanceDirs.join(", ")}\`);
  }
}

/**
 * List all available instance names
 */
export function getAvailableInstances(): InstanceName[] {
  return [${instanceDirs.map((name) => `'${name}'`).join(", ")}];
}

// Re-export individual instances for direct access if needed
// Use these with caution as they may cause type conflicts with multiple databases
`;

		// Add individual exports with clear warnings
		for (const instanceName of instanceDirs) {
			indexContent += `
/**
 * Direct access to ${instanceName} query builder
 * WARNING: Using multiple direct imports may cause TypeScript type conflicts
 * Prefer using getQueryBuilder('${instanceName}') instead
 */
export * as ${instanceName}_qb from './${instanceName}';`;
		}

		indexContent += `

// For backward compatibility, export the first instance as default
// This will be removed in a future version - use getQueryBuilder() instead
`;

		if (instanceDirs.length > 0) {
			const defaultInstance = instanceDirs[0];
			indexContent += `/**
 * @deprecated Use getQueryBuilder('${defaultInstance}') instead
 * Default export for backward compatibility (instance: ${defaultInstance})
 */
export { default } from './${defaultInstance}';`;
		}

		await fs.writeFile(indexPath, indexContent);
		console.log(
			`✅ Created query builder index with ${instanceDirs.length} instance(s)`,
		);
	} catch (error) {
		console.error("Failed to create query builder index:", error.message);
	}
}

async function main() {
	try {
		console.log("🔍 Auto-generating EdgeQL query builders...");

		const credentialsDir = path.join(process.cwd(), "instance_credentials");

		if (!fs.existsSync(credentialsDir)) {
			console.log(
				"No instance_credentials directory found. Creating fallback structure.",
			);
			await createQueryBuilderIndex();
			return;
		}

		const files = fs.readdirSync(credentialsDir);
		const jsonFiles = files.filter((file) => file.endsWith(".json"));

		if (jsonFiles.length === 0) {
			console.log("No credential files found. Creating fallback structure.");
			await createQueryBuilderIndex();
			return;
		}

		console.log(
			`Found ${jsonFiles.length} credential file(s): ${jsonFiles.join(", ")}`,
		);

		// Test connections and generate query builders
		const results = {
			successful: [],
			failed: [],
		};

		for (const file of jsonFiles) {
			const instanceName = path.basename(file, ".json");
			const credentialFile = path.join(credentialsDir, file);

			console.log(`\n📡 Processing instance: ${instanceName}`);

			// Test connection first
			const canConnect = await testConnection(credentialFile);

			if (canConnect) {
				// Generate query builder
				const generated = await generateQueryBuilder(
					credentialFile,
					instanceName,
				);
				if (generated) {
					results.successful.push(instanceName);
				} else {
					results.failed.push(instanceName);
				}
			} else {
				results.failed.push(instanceName);
			}
		}

		// Create the index file regardless of success/failure
		await createQueryBuilderIndex();

		// Summary
		console.log("\n📊 Summary:");
		if (results.successful.length > 0) {
			console.log(
				`✅ Successfully generated for: ${results.successful.join(", ")}`,
			);
		}
		if (results.failed.length > 0) {
			console.log(`❌ Failed for: ${results.failed.join(", ")}`);
		}

		console.log("🎉 Auto-generation complete!");
	} catch (error) {
		console.error("Error in auto-generation script:", error);
		// Still try to create a fallback structure
		try {
			await createQueryBuilderIndex();
		} catch (fallbackError) {
			console.error("Failed to create fallback structure:", fallbackError);
		}
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}

module.exports = { main };
