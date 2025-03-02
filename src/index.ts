import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "gel"; // The Gel client library
import * as gelLib from "gel"; // Import all exports from Gel
import e from "./edgeql-js/index.js";
// Import the EdgeQL query builder
// import { createClient as createEdgeQLClient } from "../dbschema/edgeql-js/index.js";

let gelClient: any; // Explicitly type as any for now

// Note: Due to TypeScript ESM compatibility issues with the generated EdgeQL query builder,
// we're using 'any' type here. In a production setting, you would properly integrate
// the EdgeQL query builder types.


async function getBranchClient(branchName: string) {
  console.error(`[getBranchClient] Starting to get client for branch: ${branchName}`);
  const branchClient = createClient({
    tlsSecurity: "insecure",
    database: branchName,
    host: "localhost",
    port: 10700,
    user: "edgedb",
    password: "6GmB7hZI5NTziQ1xEdGaGoQe",
    // Add other connection parameters if needed (host, user, password, etc.)
  });
  console.error(`[getBranchClient] Successfully created client for branch: ${branchName}`);
  return branchClient;
}

// Initialize Gel client
async function initGelClient() {
  try {
    // You can configure this with environment variables or directly here
    // Use the branch ID from environment or default to example
    const branchId = process.env.GEL_BRANCH_ID || "3802d36f-f2e8-45e5-abe4-8f5d2ecdff0e";
    gelClient = await getBranchClient(branchId);
    
    // Test connection
    const result = await gelClient.query('SELECT "Gel MCP Server connection test"');
    console.error('Gel database connection successful:', result);
    return true;
  } catch (error) {
    console.error('Error connecting to Gel database:', error);
    return false;
  }
}

// Create server instance
const server = new McpServer({
  name: "gel-database",
  version: "1.0.0",
});

// ===== GEL DATABASE QUERY TOOLS =====

// Tool to execute raw EdgeQL queries
server.tool(
  "execute-edgeql",
  "Execute a raw EdgeQL query on the Gel database",
  {
    query: z.string().describe("The EdgeQL query to execute"),
    args: z.record(z.any()).optional().describe("Optional query arguments"),
  },
  async (args, extra) => {
    try {
      console.error(`[execute-edgeql] Executing query: ${args.query}`);
      
      if (!gelClient) {
        return {
          content: [
            {
              type: "text",
              text: "Database client is not initialized.",
            },
          ],
        };
      }
      
      // Execute query with or without arguments based on whether args are provided
      let result;
      if (args.args && Object.keys(args.args).length > 0) {
        result = await gelClient.query(args.query, args.args);
      } else {
        result = await gelClient.query(args.query);
      }
      
      return {
        content: [
          {
            type: "text",
            text: "Query executed successfully:",
          },
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error executing EdgeQL query:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing query: ${error?.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to describe the database schema for a type
server.tool(
  "describe-schema",
  "Get schema information for a specific type",
  {
    typeName: z.string().describe("Name of the type to describe"),
  },
  async (args, extra) => {
    try {
      if (!gelClient) {
        return {
          content: [
            {
              type: "text",
              text: "Database client is not initialized.",
            },
          ],
        };
      }

      // Use introspection query to get schema information
      const query = `
        WITH module schema
        SELECT ObjectType {
          name,
          properties: {
            name,
            target: { name },
            cardinality,
            required
          },
          links: {
            name,
            target: { name },
            cardinality,
            required
          }
        }
        FILTER .name = <str>$typeName
      `;

      const result = await gelClient.query(query, { typeName: `default::${args.typeName}` });

      if (!result || result.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Type '${args.typeName}' not found in the schema.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Schema for type '${args.typeName}':`,
          },
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error describing schema:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error describing schema: ${error?.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to validate EdgeQL query syntax
server.tool(
  "validate-query",
  "Validate EdgeQL query syntax without executing it",
  {
    query: z.string().describe("The EdgeQL query to validate"),
  },
  async (args, extra) => {
    try {
      if (!gelClient) {
        return {
          content: [
            {
              type: "text",
              text: "Database client is not initialized.",
            },
          ],
        };
      }

      // Using a query with ANALYZE to validate syntax
      const analyzeQuery = `ANALYZE ${args.query};`;
      await gelClient.query(analyzeQuery);

      return {
        content: [
          {
            type: "text",
            text: "Query syntax is valid.",
          },
        ],
      };
    } catch (error: any) {
      console.error("Error validating query:", error);
      return {
        content: [
          {
            type: "text",
            text: "Query validation failed:",
          },
          {
            type: "text",
            text: error?.message || "Unknown error",
          },
        ],
      };
    }
  },
);

// Tool to execute TypeScript code with access to the EdgeQL query builder
server.tool(
  "execute-typescript",
  "Execute a TypeScript code snippet with access to the EdgeQL query builder. For best results with EdgeQL queries: 1) Use 'await gelClient.query()' with console.log to display results 2) Use ORDER BY with THEN not commas (e.g., ORDER BY .field1 THEN .field2) 3) Keep code simple and focused on a single operation. Example: console.log(await gelClient.query(`SELECT Product { name, price } FILTER .price > 100 ORDER BY .price DESC LIMIT 5;`));",
  {
    code: z.string().describe("The TypeScript code to execute"),
    timeout: z.number().optional().describe("Maximum execution time in milliseconds (default: 5000)"),
    use_gel_client: z.boolean().optional().describe("Automatically inject the configured Gel client (default: true)"),
  },
  async (args, extra) => {
    try {
      console.error("[execute-typescript] Starting execution");

      // Check if gelClient is required but not initialized
      if (args.use_gel_client !== false && !gelClient) {
        console.error("[execute-typescript] Database client not initialized");
        return {
          content: [
            {
              type: "text",
              text: "Database client is not initialized and use_gel_client is true.",
            },
          ],
        };
      }

      // Log the code for debugging
      console.error(`[execute-typescript] Executing code:\n${args.code}`);

      // Set up the evaluation context with explicit log capture
      let capturedLogs: string[] = [];
      const context = {
        e, // EdgeQL query builder
        gelClient: args.use_gel_client !== false ? gelClient : undefined,
        console: {
          log: (...args: any[]) => {
            const logMsg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            capturedLogs.push(logMsg);
            process.stderr.write(`[TS Script Log]: ${logMsg}\n`);
          },
          error: (...args: any[]) => {
            const logMsg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            capturedLogs.push(`ERROR: ${logMsg}`);
            process.stderr.write(`[TS Script Error]: ${logMsg}\n`);
          },
        },
        setTimeout,
        clearTimeout,
        Promise,
        String,
        Number,
        Boolean,
        Array,
        Object,
        JSON,
        Date,
        Math,
        Error,
      };

      // Prepare the code for execution with an async IIFE
      const scriptToExecute = `
        (async () => {
          console.log("[Inside] Starting script");
          try {
            let __result;
            __result = (async () => {
              return ${args.code};
            })();
            console.log("[Inside] Code executed");
            return await __result;
          } catch (error) {
            console.error("Script execution error:", error.message);
            return { error: error.message, stack: error.stack };
          }
        })()
      `;

      // Set up timeout mechanism
      const timeoutMs = args.timeout || 5000;
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      console.error("[execute-typescript] Creating execution script");

      // Use vm module for execution
      const vm = require('vm');
      try {
        const script = new vm.Script(scriptToExecute);
        const contextObject = vm.createContext(context);

        console.error("[execute-typescript] Starting execution with timeout:", timeoutMs);

        const executionPromise = Promise.resolve(script.runInContext(contextObject));

        // Race between execution and timeout
        const result = await Promise.race([executionPromise, timeoutPromise])
          .finally(() => clearTimeout(timeoutId));

        console.error("[execute-typescript] Execution completed, result type:", typeof result);

        // Return the result and captured logs
        return {
          content: [
            {
              type: "text",
              text: `Execution result:\n${JSON.stringify(result, null, 2)}`,
            },
            {
              type: "text",
              text: capturedLogs.length > 0 ? `Console output:\n${capturedLogs.join('\n')}` : "No console output.",
            },
          ],
        };
      } catch (vmError: any) {
        console.error("[execute-typescript] VM execution error:", vmError);
        return {
          content: [
            {
              type: "text",
              text: `VM execution error: ${vmError?.message || "Unknown error"}`,
            },
            {
              type: "text",
              text: vmError?.stack || "",
            },
          ],
        };
      }
    } catch (error: any) {
      console.error("[execute-typescript] Top level error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing TypeScript: ${error?.message || "Unknown error"}`,
          },
          {
            type: "text",
            text: error?.stack || "",
          },
        ],
      };
    }
  },
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const connected = await initGelClient();
  console.error("Gel MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
