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

### Running the Server

1.  **Standard I/O (stdio) Mode (Default)**:
    Ideal for local development and IDE integration:
    ```bash
    npm run start:stdio
    # or simply:
    npm start
    ```

2.  **HTTP Mode**:
    Runs as a standalone Fastify web server on port 3000:
    ```bash
    npm run start:http
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
- `search_gel_docs`: Searches local Gel documentation
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

The `execute-typescript` tool runs code in a Node.js VM. **This is inherently risky**:
- Never expose the server to untrusted users
- Only use in secure, controlled environments
- Consider disabling this tool in production

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