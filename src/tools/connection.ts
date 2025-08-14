import { execSync as exec } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findProjectRoot, getAvailableInstances } from "../database.js";
import { emitConnectionChanged } from "../events.js";
import { updateSchemaWatcher } from "../schemaWatcher.js";
import { getDefaultConnection, setDefaultConnection } from "../session.js";
import {
  buildToolResponse,
  validateConnection
import {
  checkRateLimit,
  validateBranchName,
  validateInstanceName,
} from "../validation.js";

export function registerConnection(server: McpServer) {
  server.registerTool(
    "connection",
    {
      title: "Connection (Auto, Set, Get, List Instances/Credentials/Branches, Switch)",
      description:
        "Consolidated connection management. Actions: 'auto' (default), 'set', 'get', 'listInstances', 'listCredentials', 'listBranches', 'switchBranch'.",
      inputSchema: {
        action: z
          .enum([
            "auto",
            "set",
            "get",
            "listInstances",
            "listCredentials",
            "listBranches",
            "switchBranch",
          ])
          .optional(),
        instance: z.string().optional(),
        branch: z.string().optional(),
      },
    },
    async (args) => {
      checkRateLimit("connection");
      const action = args.action ?? "auto";

      const projectRoot = findProjectRoot();

      const applySet = (instance: string, branch?: string) => {
        setDefaultConnection(instance, branch);
        updateSchemaWatcher();
        const current = getDefaultConnection();
        emitConnectionChanged({
          instance: current.defaultInstance,
          branch: current.defaultBranch,
        });
        return current;
      };

      try {
        switch (action) {
          case "get": {
            const current = getDefaultConnection();
            return buildToolResponse({
              status: "info",
              title: "Current default connection",
              jsonData: current,
            });
          }
          case "listInstances":
          case "listCredentials": {
            const instances = getAvailableInstances();
            if (instances.length === 0) {
              return buildToolResponse({
                status: "warn",
                title: "No instances found",
                textSections: [
                  "Create 'instance_credentials' and add JSON credential files (e.g., mydb.json).",
                ],
              });
            }
            return buildToolResponse({
              status: "success",
              title: `Found ${instances.length} instance(s)`,
              jsonData: instances,
              textSections: [
                "Next: set a default connection:",
                '@[connection action="set" instance="<NAME>" branch="main"]',
              ],
            });
          }
          case "listBranches": {
            const instance = args.instance || getDefaultConnection().defaultInstance;
            if (!instance) {
              return buildToolResponse({
                status: "error",
                title: "No instance provided",
                textSections: [
                  "Provide 'instance' or set a default first: @[connection action=\"set\" instance=\"<NAME>\" branch=\"main\"]",
                ],
              });
            }
            try {
              validateInstanceName(instance);
            } catch (e) {
              return buildToolResponse({
                status: "error",
                title: "Invalid instance name",
                textSections: [e instanceof Error ? e.message : String(e)],
              });
            }
            const output = exec(`gel branch list --instance=${instance}`, {
              encoding: "utf8",
              timeout: 10000,
              cwd: projectRoot,
            });
            const lines = output.trim().split("\n");
            const branches: Array<{ name: string; current: boolean }>=[];
            for (const line of lines) {
              const t = line.trim();
              if (!t || t.startsWith("Available branches") || t.startsWith("---"))
                continue;
              const currentMatch = t.match(/^\*\s+(.+)$/);
              const regularMatch = t.match(/^\s+(.+)$/);
              if (currentMatch) branches.push({ name: currentMatch[1].trim(), current: true });
              else if (regularMatch) branches.push({ name: regularMatch[1].trim(), current: false });
              else if (!t.includes(" ")) branches.push({ name: t, current: false });
            }
            if (branches.length === 0) {
              return buildToolResponse({
                status: "warn",
                title: `No branches found for '${instance}'`,
                textSections: [output],
              });
            }
            return buildToolResponse({
              status: "success",
              title: `Branches for '${instance}'`,
              jsonData: branches,
              textSections: [
                "Next: switch:",
                '@[connection action="switchBranch" branch="<NAME>"]',
              ],
            });
          }
          case "switchBranch": {
            const instance = args.instance || getDefaultConnection().defaultInstance;
            if (!instance) {
              return buildToolResponse({
                status: "error",
                title: "No instance provided",
                textSections: [
                  "Set a default first: @[connection action=\"set\" instance=\"<NAME>\" branch=\"main\"]",
                ],
              });
            }
            if (!args.branch) {
              return buildToolResponse({
                status: "error",
                title: "Missing 'branch'",
                textSections: [
                  "Provide branch: @[connection action=\"switchBranch\" branch=\"main\"]",
                ],
              });
            }
            try {
              validateInstanceName(instance);
              validateBranchName(args.branch);
            } catch (err) {
              return buildToolResponse({
                status: "error",
                title: "Invalid input",
                textSections: [err instanceof Error ? err.message : String(err)],
              });
            }
            exec(`npx gel branch switch ${args.branch} --instance ${instance}`, {
              encoding: "utf8",
            });
            updateSchemaWatcher();
            emitConnectionChanged({ instance, branch: args.branch });
            return buildToolResponse({
              status: "success",
              title: `Switched to branch '${args.branch}' on '${instance}'`,
            });
          }
          case "set": {
            if (args.instance) {
              try { validateInstanceName(args.instance); } catch (e) {
                return buildToolResponse({ status: "error", title: "Invalid instance", textSections: [e instanceof Error ? e.message : String(e)] });
              }
            }
            if (args.branch) {
              try { validateBranchName(args.branch); } catch (e) {
                return buildToolResponse({ status: "error", title: "Invalid branch", textSections: [e instanceof Error ? e.message : String(e)] });
              }
            }
            const pickedInstance = args.instance ?? getAvailableInstances().sort()[0];
            if (!pickedInstance) {
              return buildToolResponse({
                status: "warn",
                title: "No instances available",
                textSections: [
                  "Create 'instance_credentials' and add a JSON credentials file.",
                ],
              });
            }
            const pickedBranch = args.branch ?? "main";
            const current = applySet(pickedInstance, pickedBranch);
            return buildToolResponse({
              status: "success",
              title: "Default connection updated",
              jsonData: current,
            });
          }
          default: {
            const current = getDefaultConnection();
            if (current.defaultInstance) {
              return buildToolResponse({
                status: "info",
                title: "Connection already set",
                jsonData: current,
              });
            }
            const instances = getAvailableInstances().sort();
            if (instances.length === 0) {
              return buildToolResponse({
                status: "warn",
                title: "No instances available",
                textSections: [
                  "Create 'instance_credentials' and add a JSON credentials file.",
                ],
              });
            }
            const chosen = instances[0];
            const updated = applySet(chosen, "main");
            return buildToolResponse({
              status: "success",
              title: "Auto-selected default connection",
              jsonData: updated,
              textSections: [
                "You can change it:",
                '@[connection action="set" instance="<NAME>" branch="main"]',
              ],
            });
          }
        }
      } catch (error: unknown) {
        return buildToolResponse({
          status: "error",
          title: "Connection tool error",
          textSections: [error instanceof Error ? error.message : String(error)],
        });
      }
    },
  );
}


