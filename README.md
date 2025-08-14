# Gel MCP Server

A powerful and flexible Model Context Protocol (MCP) server for interacting with Gel (EdgeDB) databases. This server provides comprehensive database management tools and supports multiple instances with automatic schema generation and type-safe query builders.

## 🚀 Recent Major Updates

- **Automated Schema Generation**: Automatically detects, tests, and generates EdgeQL query builders for all instances
- **Modern MCP SDK**: Updated to use the latest MCP TypeScript SDK patterns
- **Multi-Instance Safety**: Prevents type conflicts when working with multiple databases
- **Smart Working Directory Detection**: Automatically finds project root regardless of execution context
- **Type-Safe Query Builders**: Instance-specific query builders with full TypeScript support

## Key Features

- **Dual Transport Modes**: Run using either `Stdio` for IDE integration or as a standalone `HTTP` server
- **Multi-Instance & Multi-Branch Support**: Seamlessly connect to and manage multiple database instances and branches
- **Automatic Discovery**: Automatically discovers instances by scanning `instance_credentials/` directory
- **Automated Query Builder Generation**: Tests connections and generates type-safe query builders automatically
- **Session-Based Defaults**: Set default instance and branch for streamlined workflow
- **JSON-Based Credentials**: Secure connection management using JSON credential files
- **Type-Safe Architecture**: Built with TypeScript, Zod validation, and modern MCP SDK patterns
- **Rich Toolset**: Comprehensive database interaction tools

## Security & Validation

- **Validated Inputs**: All tools that accept `instance`/`branch` validate names before use.
- **Rate Limiting**: Enforced on execute/high-frequency tools to prevent abuse.
- **Safe Execution**: TypeScript code runs in `isolated-vm` when available; unsafe fallback is disabled in production.

## HTTP Transport

The HTTP server uses Streamable HTTP transport with:

- DNS rebinding protection enabled
- Allowed hosts limited to `localhost`/`127.0.0.1` by default

---

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- `npx` (comes with Node.js)
- A running Gel (EdgeDB) instance with credentials

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd gel-mcp-server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up instance credentials:**
    Create the `instance_credentials/` directory and add your database credential files:
    ```bash
    mkdir -p instance_credentials
    ```
    
    **Generate credential files using gel CLI:**
    
    If you have instances already linked with the `gel` CLI, you can automatically generate credential files:
    ```bash
    # List your linked instances first
    gel instance list
    
    # Generate credential file for a specific instance
    gel -I your_instance_name instance credentials --json --insecure-dsn > instance_credentials/your_instance_name.json
    ```
    
    Replace `your_instance_name` with your actual instance name. If the command doesn't work, it means:
    - The instance isn't linked to your local `gel` CLI
    - You need to link it first with `gel instance link your_instance_name`
    - Or the instance name is incorrect

4.  **Generate query builders:**
    ```bash
    npm run generate-schemas
    ```
    This will:
    - Test connections to all discovered instances
    - Generate TypeScript query builders for successful connections
    - Create an instance index for type-safe access

5.  **Build the project:**
    ```bash
    npm run build
    ```

### 🏗️ Building the Project

The build process is automated and includes:

1. **Schema Generation**: Automatically scans `instance_credentials/` and generates TypeScript query builders
2. **TypeScript Compilation**: Compiles all TypeScript code to JavaScript
3. **Executable Setup**: Makes the output executable for MCP usage

**Build Commands:**
```bash
# Full build (recommended)
pnpm run build

# Individual steps
pnpm run generate-schemas  # Generate query builders only
pnpm run lint             # Check code quality
pnpm run format           # Format code
```

**Build Output:**
- `build/` directory contains compiled JavaScript
- `src/edgeql-js/` contains generated query builders
- `build/index.js` is the main executable

### 🚀 Running the Server

1.  **Standard I/O (stdio) Mode (Default)**:
    Ideal for local development and IDE integration:
    ```bash
    pnpm run start:stdio
    # or simply:
    pnpm start
    ```

2.  **HTTP Mode**:
    Runs as a standalone Fastify web server on port 3000:
    ```bash
    pnpm run start:http
    ```

---

## 🔧 Automated Schema Generation

### How It Works

The server includes an automated schema generation system that:

1. **Discovers Instances**: Scans `instance_credentials/*.json` files
2. **Tests Connections**: Verifies each instance is accessible
3. **Generates Query Builders**: Creates TypeScript query builders for successful connections
4. **Organizes by Instance**: Each instance gets its own folder to prevent type conflicts
5. **Creates Index**: Provides type-safe access to all query builders

### Commands

- `npm run generate-schemas`: Manually run schema generation
- `npm run build`: Automatically runs schema generation before compilation

### Generated Structure

```
src/edgeql-js/
├── index.ts                 # Main index with instance management
├── instance1/               # Query builder for instance1
│   ├── index.ts
│   ├── modules/
│   └── ...
└── instance2/               # Query builder for instance2
    ├── index.ts
    ├── modules/
    └── ...
```

### Using Query Builders

```typescript
// Get query builder for specific instance
import { getQueryBuilder } from './src/edgeql-js';

const e = await getQueryBuilder('my_instance');
const result = await e.select(e.Movie, () => ({
  title: true,
  actors: { name: true }
})).run(client);

// List available instances
import { getAvailableInstances } from './src/edgeql-js';
console.log(getAvailableInstances()); // ['instance1', 'instance2']
    ```

---

## Connection Management

### 1. JSON Credential Files

Create JSON files in `instance_credentials/` directory using the `gel` CLI. The filename (without `.json`) becomes the instance name.

**⚠️ Important: Do NOT create credential files manually!** Always use the `gel` CLI to ensure correct format and avoid errors:

```bash
# Generate credential file for production instance
gel -I production instance credentials --json --insecure-dsn > instance_credentials/production.json

# Generate credential file for staging instance  
gel -I staging instance credentials --json --insecure-dsn > instance_credentials/staging.json
```

The `gel` CLI will automatically generate the correct JSON format with all necessary fields. Manual creation is error-prone and not recommended.

### 2. Session Defaults

Set default instance and branch for your session:
```
@[set-default-connection instance="production" branch="main"]
@[get-default-connection]
```

### 3. Tool Parameters

All tools accept optional `instance` and `branch` parameters:
```
@[execute-edgeql instance="staging" branch="feature-x" query="SELECT count(User)"]
```

**Connection Priority:**
Tool Parameter > Session Default > Project Default

---

## 🛠 Available Tools

### Instance & Branch Management
- `list-instances`: Auto-discovers and lists all available instances
- `list-branches`: Lists all branches for a specific instance
- `switch-branch`: Switches the active branch for an instance
- `list-credentials`: Lists available credential files
- `set-default-connection`: Sets session defaults
- `get-default-connection`: Shows current session defaults

### Schema & Querying
- `get-schema`: Dumps the entire schema as text
- `list-schema-types`: Lists all object types in the schema
- `describe-schema`: Detailed information about a specific schema type
- `execute-edgeql`: Executes raw EdgeQL queries
- `validate-query`: Validates EdgeQL syntax without execution
- `execute-typescript`: Executes TypeScript with injected Gel client

### Code Generation
- `refresh-schema`: Regenerates EdgeQL query builder files for a specific instance

### Documentation & Utilities
- `search_gel_docs`: Searches local Gel documentation (supports `match_all_terms` and `context_lines`)
- `debug-filesystem`: Debug tool for troubleshooting file system issues
- `prompt-code-review`: Generates code review prompts
- `prompt-search-docs`: Generates documentation search tool calls
- `prompt-run-edgeql`: Generates EdgeQL execution tool calls

---

## 🔒 Multi-Instance Type Safety

### Problem Solved

When working with multiple databases that have similar schemas, importing all query builders simultaneously can cause TypeScript type conflicts.

### Solution

The server uses lazy loading and instance-specific access:

```typescript
// ✅ Safe: Load query builder on demand
const e1 = await getQueryBuilder('instance1');
const e2 = await getQueryBuilder('instance2');

// ❌ Risky: Direct imports may conflict
import e1 from './edgeql-js/instance1';
import e2 from './edgeql-js/instance2';
```

### Best Practices

1. **Use `getQueryBuilder()`**: Always use the provided function for instance-specific access
2. **Avoid Direct Imports**: Don't import query builders directly unless you're sure there are no conflicts
3. **Instance Isolation**: Each instance's query builder is completely isolated from others

---

## 🏗 Architecture Overview

### Working Directory Detection

The server automatically detects the correct project root by:
1. Looking for `package.json` in the current directory and parent directories
2. Checking for `instance_credentials/` directory existence
3. Falling back to `process.cwd()` if detection fails

This ensures the server works correctly regardless of where it's executed from.

### Connection Management

- **Client Registry**: Maintains cached connections per instance/branch combination
- **Automatic Cleanup**: Properly closes connections when the server shuts down
- **Error Handling**: Graceful fallback when instances are unavailable

### Build Process

1. **Pre-build**: Automatically runs schema generation
2. **Compilation**: TypeScript compilation with proper module resolution
3. **Post-build**: Sets executable permissions on output files

---

## 📝 Environment Variables

Optional environment variables for default connection settings:
- `GEL_DB_HOST`: Default database host
- `GEL_DB_PORT`: Default database port
- `GEL_DB_USER`: Default database user
- `GEL_DB_PASSWORD`: Default database password
- `GEL_BRANCH_ID`: Default branch

---

## 🚨 Security Considerations

### Execute TypeScript Tool

The `execute-typescript` tool executes code in a sandboxed environment using `isolated-vm` when available. **While much safer than alternatives, code execution always carries some risk**:

- **Secure Mode**: When `isolated-vm` is available, code runs in a proper sandboxed V8 isolate with:
  - **Strong Isolation**: Separate V8 isolate with no access to main process
  - **Memory limits** (configurable, default 128MB)
  - **Execution timeouts** (configurable, default 30 seconds)
  - **No Node.js APIs**: Cannot access file system, network, or system commands
  - **No Global Access**: Cannot access `process`, `global`, or application state
  - **Resource Controls**: CPU and memory usage strictly limited
  - **Only Safe APIs**: Access limited to provided `gelClient.query()` method and safe console

- **Security Level**: `isolated-vm` provides **enterprise-grade sandboxing** similar to browser JavaScript execution. It's the same technology used by:
  - Cloudflare Workers
  - Deno Deploy  
  - Various serverless platforms

- **Fallback Mode**: When `isolated-vm` is not available:
  - Uses unsafe `Function` constructor (equivalent to `eval()`)
  - **DISABLED in production** for security
  - Only available in development environments

- **Risk Assessment**:
  - ✅ **Very Low Risk**: With `isolated-vm` in normal circumstances
  - ⚠️ **Theoretical Risks**: V8 engine vulnerabilities, timing attacks
  - 🔒 **Industry Standard**: Same isolation used by major cloud providers
  - 🛡️ **Defense in Depth**: Multiple layers of protection (validation + sandboxing + limits)

- **Security Best Practices**:
  - Monitor execution logs for suspicious activity
  - Use configuration to restrict code length and patterns
  - Consider disabling entirely if not needed
  - Keep `isolated-vm` and Node.js updated

- **Configuration**: TypeScript execution can be disabled via:
  ```json
  {
    "security": {
      "executeTypescript": {
        "enabled": false
      }
    }
  }
  ```

### Credential Files

- Store credential files securely
- Use environment variables for sensitive data in production
- Ensure `instance_credentials/` is in `.gitignore`

---

## 🔄 Development Workflow

### Adding a New Instance

**Using gel CLI:**
1. Link your instance: `gel instance link your_instance_name`
2. Generate credential file: `gel -I your_instance_name instance credentials --json --insecure-dsn > instance_credentials/your_instance_name.json`
3. Generate schemas: `npm run generate-schemas`
4. Build project: `npm run build`
5. Restart MCP server in your IDE

### Updating Schemas

When your database schema changes:
```bash
npm run generate-schemas  # Regenerate all query builders
npm run build            # Recompile the project
```

### Debugging

Use the debug tool to troubleshoot issues:
```
@[debug-filesystem]
```

This shows:
- Current working directory
- Detected project root
- Available credential files
- File system status

---

## 🤝 Integration with IDEs

### Cursor Integration

Add to your Cursor MCP configuration:
```json
{
  "gel-mcp-server": {
    "command": "node",
    "args": ["/path/to/gel-mcp-server/build/index.js"],
    "cwd": "/path/to/gel-mcp-server"
  }
}
```

### VS Code Integration

Use the MCP extension with similar configuration for VS Code support.

---

## 📚 Learn More

- [Model Context Protocol](https://modelcontextprotocol.io/quickstart)
- [Gel (EdgeDB) Documentation](https://docs.edgedb.com/)
- [EdgeQL Query Builder](https://docs.edgedb.com/libraries/js/querybuilder)

---

## 🎯 Troubleshooting

### Common Issues

1. **"No query builders available"**
   - Run `npm run generate-schemas`
   - Check that credential files exist and are valid
   - Verify database connections

2. **Credential generation fails**
   ```bash
   # Check if instance is linked
   gel instance list
   
   # If not listed, link it first
   gel instance link your_instance_name
   
   # Then generate credentials
   gel -I your_instance_name instance credentials --json --insecure-dsn > instance_credentials/your_instance_name.json
   ```

3. **Type conflicts with multiple instances**
   - Use `getQueryBuilder()` instead of direct imports
   - Ensure each instance has its own directory

4. **Working directory issues**
   - Use the `debug-filesystem` tool to check paths
   - Ensure MCP server is configured with correct `cwd`

5. **Connection failures**
   - Verify credential file format
   - Test connections manually with `gel` CLI
   - Check network connectivity and permissions

### Getting Help

If you encounter issues:
1. Run `@[debug-filesystem]` to check the environment
2. Check the credential files format
3. Verify database connectivity with `gel instance list`
4. Review the server logs for detailed error messages

## ⚙️ Configuration

The server supports comprehensive configuration via:
1. Configuration file: `gel-mcp-config.json`
2. Environment variables (prefixed with `GEL_`)
3. Built-in defaults

### Configuration File Example

Create `gel-mcp-config.json` in your project root:

```json
{
  "server": {
    "port": 3000,
    "host": "localhost",
    "timeout": 30000
  },
  "database": {
    "defaultInstance": "your_instance_name",
    "defaultBranch": "main",
    "connectionTimeout": 10000,
    "queryTimeout": 30000
  },
  "schemaWatcher": {
    "enabled": true,
    "maxRetries": 3,
    "retryDelay": 5000
  },
  "security": {
    "executeTypescript": {
      "enabled": true,
      "timeout": 30000,
      "memoryLimit": 128,
      "maxCodeLength": 10000
    },
    "rateLimit": {
      "enabled": true,
      "windowMs": 60000,
      "maxRequests": 100,
      "executeToolsLimit": 10
    }
  }
}
```

### Environment Variables

- `GEL_MCP_PORT`: Server port (default: 3000)
- `GEL_MCP_HOST`: Server host (default: localhost)
- `GEL_DEFAULT_INSTANCE`: Default database instance
- `GEL_DEFAULT_BRANCH`: Default branch (default: main)
- `GEL_EXECUTE_TYPESCRIPT_ENABLED`: Enable/disable TypeScript execution (true/false)
- `GEL_SCHEMA_WATCHER_ENABLED`: Enable/disable schema watcher (true/false)
- `GEL_RATE_LIMIT_ENABLED`: Enable/disable rate limiting (true/false)
- `LOG_LEVEL`: Logging level (error, warn, info, debug)

---

## 🤝 Contributing

We welcome contributions to the Gel MCP Server! This section will help you get started with development and contributing to the project.

### 🚀 Quick Start for Contributors

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/gel-mcp-server.git
   cd gel-mcp-server
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Set Up Development Environment**
   ```bash
   # Copy example configuration
   cp gel-mcp-config.json.example gel-mcp-config.json
   
   # Edit configuration for your environment
   # Add your instance credentials to instance_credentials/
   ```

4. **Build the Project**
   ```bash
   pnpm run build
   ```

### 🔧 Development Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Full build (schema generation + TypeScript compilation) |
| `pnpm run start` | Start server in stdio mode |
| `pnpm run start:http` | Start server in HTTP mode |
| `pnpm run generate-schemas` | Generate EdgeQL query builders only |
| `pnpm run lint` | Run linting checks |
| `pnpm run format` | Format code with Biome |
| `pnpm run test` | Run tests |

### 🏗️ Build Process

The build process consists of two main steps:

1. **Schema Generation** (`prebuild`):
   - Scans `instance_credentials/` for JSON files
   - Tests database connections
   - Generates TypeScript query builders for each instance
   - Creates type-safe access patterns

2. **TypeScript Compilation**:
   - Compiles TypeScript to JavaScript
   - Outputs to `build/` directory
   - Makes `index.js` executable

### 📁 Project Structure

```
gel-mcp-server/
├── src/
│   ├── tools/           # MCP tool implementations
│   ├── edgeql-js/       # Generated query builders (auto-generated)
│   ├── config.ts        # Configuration management
│   ├── validation.ts    # Input validation & security
│   ├── errors.ts        # Error handling system
│   ├── database.ts      # Database connection management
│   ├── session.ts       # Session state management
│   ├── logger.ts        # Logging utilities
│   ├── http.ts          # HTTP server implementation
│   ├── app.ts           # MCP server setup
│   └── index.ts         # Main entry point (stdio mode)
├── scripts/
│   └── auto-generate-schemas.js  # Schema generation script
├── instance_credentials/    # Database credentials (gitignored)
├── logs/                   # Log files (gitignored)
└── build/                  # Compiled output (gitignored)
```

### 🛠️ Adding New Tools

To add a new MCP tool:

1. **Create Tool File**
   ```typescript
   // src/tools/myNewTool.ts
   import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { z } from "zod";
   import { wrapToolFunction, createSuccessResponse } from "../errors.js";
   
   export function registerMyNewTool(server: McpServer) {
     server.registerTool(
       "my-new-tool",
       {
         title: "My New Tool",
         description: "Description of what this tool does",
         inputSchema: {
           param1: z.string(),
           param2: z.number().optional(),
         },
       },
       wrapToolFunction(async (args) => {
         // Your tool implementation here
         return createSuccessResponse("Tool executed successfully", result);
       })
     );
   }
   ```

2. **Register in Index**
   ```typescript
   // src/tools/index.ts
   import { registerMyNewTool } from "./myNewTool.js";
   
   export function registerAllTools(server: McpServer) {
     // ... existing tools
     registerMyNewTool(server);
   }
   ```

3. **Add Validation (if needed)**
   ```typescript
   // src/validation.ts - add any custom validation functions
   ```

### 🧪 Testing Guidelines

- **Unit Tests**: Test individual functions and utilities
- **Integration Tests**: Test tool functionality end-to-end
- **Security Tests**: Validate input sanitization and security measures
- **Manual Testing**: Test with real MCP clients (Cursor, VS Code)

### 🔒 Security Considerations for Contributors

When contributing, please:

1. **Validate All Inputs**: Use validation functions from `src/validation.ts`
2. **Handle Errors Properly**: Use error classes from `src/errors.ts`
3. **Follow Rate Limiting**: Respect rate limits for execute tools
4. **Sanitize Outputs**: Never expose sensitive information in responses
5. **Test Security**: Verify that your changes don't introduce vulnerabilities

### 📝 Code Style

We use Biome for consistent code formatting and linting:

- **Formatting**: `pnpm run format`
- **Linting**: `pnpm run lint`
- **Config**: See `biome.json`

**Key Guidelines**:
- Use TypeScript for all new code
- Add JSDoc comments for public functions
- Use structured logging with context
- Follow existing error handling patterns
- Write comprehensive input validation

### 🐛 Reporting Issues

When reporting issues, please include:

1. **Environment Information**:
   - Node.js version
   - Operating system
   - Gel CLI version
   - MCP client (Cursor, VS Code, etc.)

2. **Steps to Reproduce**:
   - Clear, numbered steps
   - Expected vs actual behavior
   - Error messages and logs

3. **Configuration** (sanitized):
   - Relevant parts of `gel-mcp-config.json`
   - Environment variables (without sensitive data)

### 🔄 Pull Request Process

1. **Before You Start**:
   - Check existing issues and PRs
   - Discuss major changes in an issue first
   - Fork the repository

2. **Development**:
   - Create a feature branch: `git checkout -b feature/my-feature`
   - Make your changes
   - Add tests if applicable
   - Run `pnpm run lint && pnpm run format`
   - Ensure `pnpm run build` succeeds

3. **Pull Request**:
   - Write clear commit messages
   - Update documentation if needed
   - Fill out the PR template
   - Link related issues

4. **Review Process**:
   - Automated checks must pass
   - Code review by maintainers
   - Address feedback promptly
   - Squash commits before merge

### 🎯 Areas for Contribution

We welcome contributions in these areas:

- **New Tools**: Additional MCP tools for database interaction
- **Security Enhancements**: Improved validation and sandboxing
- **Performance**: Optimization of query builders and connections
- **Documentation**: Better examples and guides
- **Testing**: More comprehensive test coverage
- **Configuration**: Additional configuration options
- **Error Handling**: Better error messages and recovery

### 📚 Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Gel (EdgeDB) Documentation](https://docs.edgedb.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Biome Documentation](https://biomejs.dev/)

### 💬 Getting Help

- **Issues**: Use GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub discussions for questions and ideas
- **Documentation**: Check the README and inline code comments

Thank you for contributing to the Gel MCP Server! 🙏

---