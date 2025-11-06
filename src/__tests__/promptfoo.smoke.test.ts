import { execSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

function resolvePromptfooBin(): string {
	const binName = process.platform === "win32" ? "promptfoo.cmd" : "promptfoo";
	return path.join(repoRoot, "node_modules", ".bin", binName);
}

describe("promptfoo MCP smoke suite", () => {
	const promptfooBin = resolvePromptfooBin();
	const command = `${promptfooBin} eval -c promptfoo/promptfooconfig.mcp.yaml`;

	test(
		"promptfoo evaluation passes",
		() => {
			try {
				const output = execSync(command, {
					cwd: repoRoot,
					encoding: "utf8",
					stdio: "pipe",
					env: {
						...process.env,
						FORCE_COLOR: "0",
					},
				});
				expect(output).toMatch(/(All tests passed|Evaluation complete)/i);
			} catch (error) {
				if (error && typeof error === "object" && "stdout" in error) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const err = error as any;
					throw new Error(
						`promptfoo eval failed:\nSTDOUT:\n${err.stdout?.toString() ?? ""}\nSTDERR:\n${err.stderr?.toString() ?? ""}`,
					);
				}
				throw error;
			}
		},
		240_000,
	);
});
