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
  "Execute TypeScript with EdgeDB query builder access. USAGE: 1) The gelClient is ALREADY SET UP - use it directly. 2) Query builder pattern: 'const query = e.select(...); const result = await query.run(gelClient);'. 3) For direct EdgeQL: 'const result = await gelClient.query(`SELECT...`);'. 4) Common patterns: e.select(e.Type, obj => ({properties, filter: e.op(...)})), e.insert(e.Type, {properties}), e.update(e.Type, obj => ({filter_single: {id: '...'}, set: {prop: value}})), e.delete(e.Type, obj => ({filter: ...})). 5) Always use try/catch for error handling. 6) Check schema first with mcp__describe_schema if unsure about types. 7) Use e.cast() for proper type conversion when needed.",
  {
    code: z.string().describe("The TypeScript code to execute"),
    timeout: z.number().optional().describe("Maximum execution time in milliseconds (default: 5000)"),
    use_gel_client: z.boolean().optional().describe("Automatically inject the configured Gel client (default: true)"),
    memory_limit: z.number().optional().describe("Maximum memory usage in MB (default: 512)"),
  },
  async (args, extra) => {
    try {
      console.error("[execute-typescript] Starting execution");
      
      // Initialize metrics for monitoring execution
      const startTime = Date.now();
      let isExecutionCompleted = false;
      let hasConnectionError = false;
      
      // Check if gelClient is required but not initialized
      if (args.use_gel_client !== false) {
        if (!gelClient) {
          console.error("[execute-typescript] Database client not initialized");
          return {
            content: [
              {
                type: "text",
                text: "Database client is not initialized. Please initialize the database connection first.",
              },
            ],
          };
        }
        
        // Test the connection before executing
        try {
          await gelClient.query('SELECT 1;');
        } catch (connError) {
          console.error("[execute-typescript] Connection test failed:", connError);
          hasConnectionError = true;
          
          // Try to reinitialize the connection
          try {
            console.error("[execute-typescript] Attempting to reconnect to database");
            await initGelClient();
            
            // Test the connection again
            await gelClient.query('SELECT 1;');
            hasConnectionError = false;
            console.error("[execute-typescript] Successfully reconnected to database");
          } catch (reconnectError) {
            console.error("[execute-typescript] Failed to reconnect:", reconnectError);
          }
          
          // If still having connection issues
          if (hasConnectionError) {
            return {
              content: [
                {
                  type: "text",
                  text: "Database connection error. The server has attempted to reconnect but was unsuccessful.",
                },
                {
                  type: "text",
                  text: "Please try again later or check your database connection configuration.",
                },
              ],
            };
          }
        }
      }

      // Log the code for debugging (but sanitize it first to avoid exposing sensitive data)
      const sanitizedCode = args.code.replace(/password\s*[:=]\s*["'].*?["']/gi, 'password: "[REDACTED]"');
      console.error(`[execute-typescript] Executing code:\n${sanitizedCode}`);
      
      // Set memory limit (default to 512MB)
      const memoryLimitMB = args.memory_limit || 512;
      const memoryLimitBytes = memoryLimitMB * 1024 * 1024;

      // Set up the evaluation context with explicit log capture and error handling
      let capturedLogs: string[] = [];
      let hasUncaughtError = false;
      
      // Create a sandboxed context with enhanced utilities
      const context = {
        e, // EdgeQL query builder
        gelClient: args.use_gel_client !== false ? gelClient : undefined,
        console: {
          log: (...args: any[]) => {
            try {
              const logMsg = args.map(a => {
                try {
                  return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
                } catch (jsonError) {
                  return `[Unserializable object: ${typeof a}]`;
                }
              }).join(' ');
              
              // Truncate very long log messages to prevent memory issues
              const maxLogLength = 10000;
              const truncatedMsg = logMsg.length > maxLogLength 
                ? logMsg.substring(0, maxLogLength) + `... [truncated, ${logMsg.length - maxLogLength} more characters]` 
                : logMsg;
              
              capturedLogs.push(truncatedMsg);
              process.stderr.write(`[TS Script Log]: ${truncatedMsg.substring(0, 1000)}${truncatedMsg.length > 1000 ? '...' : ''}\n`);
            } catch (logError) {
              process.stderr.write(`[TS Script Log Error]: Failed to process log message\n`);
            }
          },
          error: (...args: any[]) => {
            try {
              const logMsg = args.map(a => {
                try {
                  return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
                } catch (jsonError) {
                  return `[Unserializable object: ${typeof a}]`;
                }
              }).join(' ');
              
              const truncatedMsg = logMsg.length > 10000 
                ? logMsg.substring(0, 10000) + `... [truncated, ${logMsg.length - 10000} more characters]` 
                : logMsg;
              
              capturedLogs.push(`ERROR: ${truncatedMsg}`);
              process.stderr.write(`[TS Script Error]: ${truncatedMsg.substring(0, 1000)}${truncatedMsg.length > 1000 ? '...' : ''}\n`);
            } catch (logError) {
              process.stderr.write(`[TS Script Error]: Failed to process error message\n`);
            }
          },
        },
        // Utilities with safety guards
        setTimeout: (fn: Function, ms: number) => {
          // Ensure timeouts don't exceed the overall execution timeout
          const safeMs = Math.min(ms, args.timeout || 5000);
          return setTimeout(fn, safeMs);
        },
        clearTimeout,
        setInterval,
        clearInterval,
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
        // Add utility function for safe database queries
        safeQuery: async (queryStr: string, params: any = {}) => {
          try {
            if (!gelClient) throw new Error("Database client not available");
            return { success: true, data: await gelClient.query(queryStr, params), error: null };
          } catch (queryError: any) {
            return { 
              success: false, 
              data: null, 
              error: queryError?.message || String(queryError),
              code: queryError?.code
            };
          }
        }
      };

      // Prepare the code for execution with a well-instrumented IIFE
      // Include memory usage monitoring, timeouts, and comprehensive error handling
      const scriptToExecute = `
        (async () => {
          console.log("[Inside] Starting script");
          
          // Define safeguards
          let executionStartTime = Date.now();
          let executionStats = {
            executionTime: 0,
            errorCount: 0
          };
          
          // Simple monitoring function
          const checkExecution = () => {
            try {
              // Update execution time
              executionStats.executionTime = Date.now() - executionStartTime;
            } catch (checkError) {
              console.error("Execution check failed:", checkError.message);
            }
          };
          
          // Set up periodic checks
          const checkInterval = setInterval(checkExecution, 500);
          
          try {
            // Execute the user code in a controlled manner
            let __result;
            __result = await (async () => {
              // Insert user code here, wrapped in extra try/catch
              try {
                ${args.code}
              } catch (userCodeError) {
                console.error("User code error:", userCodeError.message);
                if (userCodeError.stack) console.error(userCodeError.stack);
                throw userCodeError;
              }
            })();
            
            // Clean up
            clearInterval(checkInterval);
            console.log("[Inside] Code executed");
            
            // Final check
            checkExecution();
            
            return {
              result: __result,
              stats: executionStats
            };
          } catch (error) {
            // Clean up
            clearInterval(checkInterval);
            
            // Check if this is a database connection error
            const isConnectionError = error.message && (
              error.message.includes("Not connected") || 
              error.message.includes("Connection closed") ||
              error.message.includes("network") ||
              error.message.includes("socket") ||
              error.message.includes("ECONNRESET") ||
              error.message.includes("timeout")
            );
            
            // Log error details
            console.error("Script execution error:", error.message);
            if (error.stack) console.error(error.stack);
            
            executionStats.errorCount++;
            
            return { 
              error: error.message || "Unknown error occurred", 
              stack: error.stack,
              isConnectionError: isConnectionError,
              stats: executionStats
            };
          }
        })()
      `;

      // Set up timeout mechanism
      const timeoutMs = args.timeout || 5000;
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          isExecutionCompleted = true;
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      console.error("[execute-typescript] Creating execution script");

      // Use vm module for execution with resource constraints
      const vm = require('vm');
      try {
        const script = new vm.Script(scriptToExecute, {
          filename: 'user-script.js',
          timeout: timeoutMs,  // Apply the timeout limit to compilation as well
        });
        
        // Create isolated context
        const contextObject = vm.createContext(context);

        console.error("[execute-typescript] Starting execution with timeout:", timeoutMs);

        const executionPromise = Promise.resolve(script.runInContext(contextObject, {
          timeout: timeoutMs,
          displayErrors: true,
        }));

        // Race between execution and timeout
        const result = await Promise.race([executionPromise, timeoutPromise])
          .finally(() => {
            clearTimeout(timeoutId);
            isExecutionCompleted = true;
          });

        // Calculate execution metrics
        const executionTime = Date.now() - startTime;
        console.error(`[execute-typescript] Execution completed in ${executionTime}ms, result type:`, typeof result);

        // Check if there was a connection error in the result
        if (result && result.isConnectionError) {
          hasConnectionError = true;
          console.error("[execute-typescript] Database connection error detected in script execution");
        }

        // Add execution stats to the output
        const executionStats = result && result.stats ? result.stats : { 
          executionTime,
          errorCount: result && result.error ? 1 : 0 
        };

        // Handle potential connection errors
        if (hasConnectionError) {
          // Add a note about connection issues
          capturedLogs.push("NOTE: A database connection error occurred. The server might need to be restarted if this persists.");
        }

        // If result is too large, truncate it
        let resultStr;
        try {
          resultStr = JSON.stringify(result && result.result ? result.result : result, null, 2);
          if (resultStr.length > 50000) {
            resultStr = resultStr.substring(0, 50000) + `... [truncated, ${resultStr.length - 50000} more characters]`;
          }
        } catch (stringifyError) {
          resultStr = `[Unserializable result of type ${typeof result}]`;
        }

        // Return the result, captured logs, and execution stats
        return {
          content: [
            {
              type: "text",
              text: `Execution result:\n${resultStr}`,
            },
            {
              type: "text",
              text: capturedLogs.length > 0 ? `Console output:\n${capturedLogs.join('\n')}` : "No console output.",
            },
            {
              type: "text",
              text: `Execution stats: Time ${executionStats.executionTime}ms | Errors ${executionStats.errorCount}`,
            },
          ],
        };
      } catch (vmError: any) {
        console.error("[execute-typescript] VM execution error:", vmError);
        
        // Handle specific types of VM errors
        let errorMessage = vmError?.message || "Unknown VM error";
        let errorType = "VM Error";
        
        // Check for specific error types
        if (errorMessage.includes("timed out")) {
          errorType = "Timeout Error";
          errorMessage = `Script execution timed out after ${timeoutMs}ms. Please simplify your code or increase the timeout limit.`;
        } else if (errorMessage.includes("memory")) {
          errorType = "Memory Error";
          errorMessage = `Script exceeded memory limits. Please reduce memory usage in your code.`;
        } else if (errorMessage.includes("Unexpected token")) {
          errorType = "Syntax Error";
        }
        
        // Include any captured logs to help with debugging
        return {
          content: [
            {
              type: "text",
              text: `${errorType}: ${errorMessage}`,
            },
            {
              type: "text",
              text: vmError?.stack || "",
            },
            {
              type: "text",
              text: capturedLogs.length > 0 ? `Console output (before error):\n${capturedLogs.join('\n')}` : "No console output before error.",
            },
          ],
        };
      }
    } catch (error: any) {
      console.error("[execute-typescript] Top level error:", error);
      
      // Categorize the error
      let errorCategory = "Uncategorized Error";
      const errorMsg = error?.message || "Unknown error";
      
      if (errorMsg.includes("out of memory") || errorMsg.includes("heap") || errorMsg.includes("memory")) {
        errorCategory = "Out of Memory Error";
      } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out")) {
        errorCategory = "Timeout Error";
      } else if (errorMsg.includes("connection") || errorMsg.includes("network") || errorMsg.includes("socket")) {
        errorCategory = "Connection Error";
      } else if (errorMsg.includes("syntax") || errorMsg.includes("unexpected token")) {
        errorCategory = "Syntax Error";
      }
      
      return {
        content: [
          {
            type: "text",
            text: `${errorCategory} executing TypeScript: ${errorMsg}`,
          },
          {
            type: "text",
            text: error?.stack || "",
          },
          {
            type: "text",
            text: "Consider simplifying your code, checking for syntax errors, or trying again later.",
          },
        ],
      };
    }
  },
);

// Tool to search the Gel documentation file
server.tool(
  "search_gel_docs",
  "Search the Gel documentation for specific terms or patterns. Returns relevant sections with context. Use this tool to find information about EdgeQL syntax, features, or examples in the documentation.",
  {
    search_term: z.string().describe("The term or pattern to search for in the documentation"),
    context_lines: z.number().optional().describe("Number of lines of context to show before and after matches (default: 5)"),
    match_all_terms: z.boolean().optional().describe("If true, search must match all terms in a multi-word query (default: false)"),
  },
  async (args, extra) => {
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      
      // Try multiple possible locations for the documentation file
      const possiblePaths = [
        path.join(__dirname, '..', 'gel_llm.txt'),         // Relative to script dir
        path.join(process.cwd(), 'gel_llm.txt'),           // Relative to current working dir
        './gel_llm.txt'                                    // Directly in workspace root
      ];
      
      let docFilePath = null;
      for (const potentialPath of possiblePaths) {
        if (fs.existsSync(potentialPath)) {
          docFilePath = potentialPath;
          console.error(`[search-gel-docs] Found documentation at: ${docFilePath}`);
          break;
        }
      }
      
      // Validate that the file exists
      if (!docFilePath) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Documentation file not found. Checked paths: " + possiblePaths.join(', '),
            },
          ],
        };
      }

      // Set default values
      const contextLines = args.context_lines || 20;
      const matchAllTerms = args.match_all_terms || false;
      const searchTerm = args.search_term;
      
      console.error("[search-gel-docs] Starting search for:", searchTerm);
      
      // Build the grep command
      let grepCommand;
      
      if (matchAllTerms && searchTerm.includes(' ')) {
        // For multi-term search with matchAllTerms, we need to perform multiple grep operations
        const terms = searchTerm.split(/\s+/).filter(t => t.trim().length > 0);
        grepCommand = `grep -n -i "${terms[0]}" "${docFilePath}"`;
        
        for (let i = 1; i < terms.length; i++) {
          grepCommand += ` | grep -i "${terms[i]}"`;
        }
      } else {
        // For single term search, we can use grep with line numbers
        grepCommand = `grep -n -i "${searchTerm}" "${docFilePath}"`;
      }
      
      try {
        // Execute the command
        const grepOutput = execSync(grepCommand, { encoding: 'utf8' });
        const matches = grepOutput.trim().split('\n').filter(Boolean);
        
        console.error(`[search-gel-docs] Found ${matches.length} matching lines`);
        
        if (matches.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No matches found." }]
          };
        }
        
        // Parse match lines into line numbers and content
        const parsedMatches = matches.map((match: string) => {
          const colonIndex = match.indexOf(':');
          if (colonIndex !== -1) {
            return {
              lineNumber: parseInt(match.substring(0, colonIndex), 10),
              lineContent: match.substring(colonIndex + 1)
            };
          }
          return null;
        }).filter(Boolean);
        
        // Read the file for context
        const fileLines = fs.readFileSync(docFilePath, 'utf8').split('\n');
        
        // Generate output with context
        let output = `Found ${parsedMatches.length} matches for "${searchTerm}":\n\n`;
        
        // Track sections to group results
        const sectionMatches: Record<string, {
          matches: Array<{lineNumber: number, lineContent: string}>;
          context?: string[];
        }> = {};
        
        // Identify sections
        const sectionBoundaries: Array<{lineNumber: number, title: string}> = [];
        
        // Find file boundaries and major section headers
        for (let i = 0; i < fileLines.length; i++) {
          const line = fileLines[i].trim();
          
          // Check for file declarations
          if (line.startsWith('.. File:')) {
            sectionBoundaries.push({
              lineNumber: i,
              title: line.substring('.. File:'.length).trim()
            });
            continue;
          }
          
          // Check for section headers (underlined titles)
          if (i > 0 && i < fileLines.length - 1) {
            const prevLine = fileLines[i-1].trim();
            
            // Section markers are lines of repeated characters
            if (line.length > 0 && /^[=\-~"'`.+_^*]+$/.test(line) && prevLine.length > 0) {
              sectionBoundaries.push({
                lineNumber: i-1,
                title: prevLine
              });
            }
          }
        }
        
        // Sort section boundaries by line number
        sectionBoundaries.sort((a, b) => a.lineNumber - b.lineNumber);
        
        // Group matches by section
        for (const match of parsedMatches) {
          // Find the section this match belongs to
          let sectionTitle = "Unknown";
          
          for (let i = sectionBoundaries.length - 1; i >= 0; i--) {
            if (match.lineNumber >= sectionBoundaries[i].lineNumber) {
              sectionTitle = sectionBoundaries[i].title;
              break;
            }
          }
          
          if (!sectionMatches[sectionTitle]) {
            sectionMatches[sectionTitle] = { matches: [] };
          }
          
          sectionMatches[sectionTitle].matches.push(match);
        }
        
        // Format output by section
        for (const [sectionTitle, { matches }] of Object.entries(sectionMatches)) {
          output += `## ${sectionTitle}\n\n`;
          
          // Get context for the first match in each section
          const firstMatch = matches[0];
          const startLine = Math.max(0, firstMatch.lineNumber - contextLines);
          const endLine = Math.min(fileLines.length - 1, firstMatch.lineNumber + contextLines);
          
          // Show context with line numbers, highlighting the matching line
          for (let i = startLine; i <= endLine; i++) {
            const isMatchLine = matches.some(m => m.lineNumber === i);
            const prefix = isMatchLine ? '> ' : '  ';
            output += `${prefix}${i+1}: ${fileLines[i]}\n`;
          }
          
          if (matches.length > 1) {
            output += `\n... and ${matches.length - 1} more match(es) in this section.\n`;
          }
          
          output += '\n---\n\n';
        }
        
        return {
          content: [{ type: "text" as const, text: output }]
        };
        
      } catch (err) {
        // If grep exits with code 1, it means no matches were found (not an error)
        const error = err as {status?: number; stderr?: string};
        if (error.status === 1 && !error.stderr) {
          return {
            content: [{ type: "text" as const, text: "No matches found." }]
          };
        }
        
        throw err;
      }
    } catch (error: unknown) {
      console.error("Error searching documentation:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching documentation: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
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
