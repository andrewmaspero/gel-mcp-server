# Gel MCP Server - Comprehensive API Documentation

This document provides comprehensive documentation for all public APIs, functions, and components in the Gel MCP Server.

## Table of Contents

1. [MCP Tools](#mcp-tools)
2. [Core APIs](#core-apis)
3. [Utility Functions](#utility-functions)
4. [Error Handling](#error-handling)
5. [Configuration](#configuration)
6. [Database Management](#database-management)
7. [Session Management](#session-management)
8. [Validation](#validation)
9. [Logging](#logging)
10. [HTTP Server](#http-server)
11. [Events](#events)
12. [Schema Watcher](#schema-watcher)

---

## MCP Tools

The Gel MCP Server exposes several MCP tools for interacting with Gel (EdgeDB) databases.

### Connection Tool

**Tool Name:** `connection`

**Description:** Consolidated connection management tool supporting multiple actions for managing database instances and branches.

**Actions:**
- `auto` (default): Automatically selects and sets a default connection
- `set`: Sets the default instance and branch
- `get`: Gets the current default connection
- `listInstances`: Lists all available instances
- `listCredentials`: Lists all credential files (alias for `listInstances`)
- `listBranches`: Lists all branches for a specific instance
- `switchBranch`: Switches the active branch for an instance

**Input Schema:**
```typescript
{
  action?: "auto" | "set" | "get" | "listInstances" | "listCredentials" | "listBranches" | "switchBranch";
  instance?: string;
  branch?: string;
}
```

**Examples:**

```typescript
// Auto-select first available instance
@[connection action="auto"]

// Set default connection
@[connection action="set" instance="production" branch="main"]

// Get current default connection
@[connection action="get"]

// List all available instances
@[connection action="listInstances"]

// List branches for an instance
@[connection action="listBranches" instance="production"]

// Switch branch
@[connection action="switchBranch" instance="production" branch="feature-x"]
```

**Response Format:**
```typescript
{
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

---

### Schema Tool

**Tool Name:** `schema`

**Description:** Consolidated schema utility for exploring database schemas, listing types, describing types, and refreshing query builders.

**Actions:**
- `overview` (default): Provides a comprehensive schema overview
- `types`: Lists all schema types
- `describe`: Describes a specific schema type
- `refresh`: Regenerates query builder files for an instance

**Input Schema:**
```typescript
{
  action?: "overview" | "types" | "describe" | "refresh";
  typeName?: string;
  instance?: string;
  branch?: string;
  topK?: number; // For types action, limits number shown
}
```

**Examples:**

```typescript
// Get schema overview
@[schema action="overview"]

// List all types
@[schema action="types" topK=30]

// Describe a specific type
@[schema action="describe" typeName="User"]

// Refresh query builder for an instance
@[schema action="refresh" instance="production"]
```

**Response Format:**
```typescript
{
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

---

### Query Tool

**Tool Name:** `query`

**Description:** Consolidated query tool for validating and executing EdgeQL queries, with support for file-based queries.

**Actions:**
- `validate` (default): Validates EdgeQL syntax without execution
- `run`: Executes an EdgeQL query
- `file`: Executes a query from a file

**Input Schema:**
```typescript
{
  action?: "validate" | "run" | "file";
  query?: string;
  args?: Record<string, any>;
  filePath?: string;
  format?: "json" | "text";
  limit?: number; // Default: 50, max: 1000
  timeout?: number;
  dryRun?: boolean;
  instance?: string;
  branch?: string;
}
```

**Examples:**

```typescript
// Validate a query
@[query action="validate" query="SELECT User { name, email }"]

// Execute a query
@[query action="run" query="SELECT User { name, email } LIMIT 10"]

// Execute with parameters
@[query action="run" query="SELECT User FILTER .email = <str>$email" args='{"email": "user@example.com"}']

// Execute from file
@[query action="file" filePath="./queries/get_users.edgeql"]

// Execute with text format
@[query action="run" query="SELECT count(User)" format="text"]
```

**Response Format:**
```typescript
{
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

---

### Docs Tool

**Tool Name:** `docs`

**Description:** Documentation search utility for searching local Gel documentation files.

**Actions:**
- `search` (default): Searches documentation for a term

**Input Schema:**
```typescript
{
  action?: "search";
  term: string;
  context_lines?: number; // Default: 3
  match_all_terms?: boolean; // Default: false
}
```

**Examples:**

```typescript
// Search documentation
@[docs action="search" term="SELECT"]

// Search with more context lines
@[docs action="search" term="migration" context_lines=5]

// Match all terms (AND search)
@[docs action="search" term="SELECT INSERT" match_all_terms=true]
```

**Response Format:**
```typescript
{
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

---

### Prompts

The server provides several MCP prompts for guided workflows:

#### `bootstrap-connection`

**Description:** Establishes connection and verifies connectivity before operations.

**Args:**
```typescript
{
  instance?: string;
  branch?: string;
}
```

**Usage:**
```typescript
@prompt bootstrap-connection instance="production" branch="main"
```

#### `schema-exploration`

**Description:** Enforces schema-first exploration workflow.

**Usage:**
```typescript
@prompt schema-exploration
```

#### `quickstart`

**Description:** Quickstart workflow covering connection, schema discovery, and query execution.

**Usage:**
```typescript
@prompt quickstart
```

#### `edgeql-workflow`

**Description:** Validation-first EdgeQL execution workflow.

**Args:**
```typescript
{
  query: string;
}
```

**Usage:**
```typescript
@prompt edgeql-workflow query="SELECT User { name }"
```

#### `recovery-playbook`

**Description:** Maps common tool errors to corrective actions.

**Usage:**
```typescript
@prompt recovery-playbook
```

#### `run-edgeql`

**Description:** Guided steps to validate and execute a single EdgeQL query.

**Args:**
```typescript
{
  query: string;
  instance?: string;
  branch?: string;
}
```

**Usage:**
```typescript
@prompt run-edgeql query="SELECT User" instance="production"
```

#### `gel-rag-bootstrap`

**Description:** Guidance for consulting Gel docs via Context7.

**Usage:**
```typescript
@prompt gel-rag-bootstrap
```

#### `gel-schema-principles`

**Description:** Key schema and performance principles.

**Usage:**
```typescript
@prompt gel-schema-principles
```

#### `search-docs`

**Description:** Generate a call to search local documentation.

**Args:**
```typescript
{
  term: string;
}
```

**Usage:**
```typescript
@prompt search-docs term="migration"
```

#### `gel-rag-suggest`

**Description:** Suggests Context7 search terms from a natural language goal.

**Args:**
```typescript
{
  goal: string;
  intent?: "query" | "schema" | "both";
}
```

**Usage:**
```typescript
@prompt gel-rag-suggest goal="paginate a SELECT over Orders" intent="query"
```

---

## Core APIs

### Database API (`src/database.ts`)

#### `findProjectRoot(): string`

Finds the project root directory by walking up from the current working directory or module directory.

**Returns:** Absolute path to project root

**Example:**
```typescript
import { findProjectRoot } from './database.js';

const root = findProjectRoot();
console.log(root); // "/path/to/gel-mcp-server"
```

---

#### `getDatabaseClient(options?: SessionOptions): Client | null`

Gets a database client for the specified instance and branch.

**Parameters:**
```typescript
interface SessionOptions {
  instance?: string;
  branch?: string;
}
```

**Returns:** Gel client instance or `null` if instance not found

**Example:**
```typescript
import { getDatabaseClient } from './database.js';

const client = getDatabaseClient({ instance: 'production', branch: 'main' });
if (client) {
  const result = await client.query('SELECT count(User)');
}
```

---

#### `listInstances(): Promise<string[]>`

Lists all available database instances by scanning the `instance_credentials/` directory.

**Returns:** Array of instance names

**Example:**
```typescript
import { listInstances } from './database.js';

const instances = await listInstances();
console.log(instances); // ["production", "staging", "dev"]
```

---

#### `listBranches(instance: string): Promise<string[]>`

Lists all branches for a specific instance.

**Parameters:**
- `instance`: Instance name

**Returns:** Array of branch names

**Example:**
```typescript
import { listBranches } from './database.js';

const branches = await listBranches('production');
console.log(branches); // ["main", "feature-x", "hotfix"]
```

---

#### `getAvailableInstances(): string[]`

Synchronously gets available instances (same as `listInstances` but synchronous).

**Returns:** Array of instance names

**Example:**
```typescript
import { getAvailableInstances } from './database.js';

const instances = getAvailableInstances();
console.log(instances); // ["production", "staging"]
```

---

#### `initGelClient(): Promise<void>`

Initializes a Gel client based on the current default connection.

**Example:**
```typescript
import { initGelClient } from './database.js';

await initGelClient();
```

---

#### `closeAllConnections(): Promise<void>`

Closes all active database connections.

**Example:**
```typescript
import { closeAllConnections } from './database.js';

await closeAllConnections();
```

---

#### `loadQueryBuilder(instance: string, branch?: string): Promise<any>`

Loads the query builder module for a specific instance.

**Parameters:**
- `instance`: Instance name
- `branch`: Branch name (default: "main")

**Returns:** Query builder module or `null` if not found

**Example:**
```typescript
import { loadQueryBuilder } from './database.js';

const qb = await loadQueryBuilder('production', 'main');
if (qb) {
  const e = await qb.getQueryBuilder('production');
  // Use query builder...
}
```

---

#### `getDebugInfo(): { projectRoot: string; cwd: string; dirname: string }`

Gets debug information about file system paths.

**Returns:** Object with project root, current working directory, and module directory

**Example:**
```typescript
import { getDebugInfo } from './database.js';

const info = getDebugInfo();
console.log(info);
// {
//   projectRoot: "/path/to/gel-mcp-server",
//   cwd: "/current/working/directory",
//   dirname: "/module/directory"
// }
```

---

### Session Management API (`src/session.ts`)

#### `setDefaultConnection(instance?: string, branch?: string): void`

Sets the default instance and/or branch for the current session.

**Parameters:**
- `instance`: Instance name (optional)
- `branch`: Branch name (optional)

**Example:**
```typescript
import { setDefaultConnection } from './session.js';

setDefaultConnection('production', 'main');
```

---

#### `getDefaultConnection(): SessionState`

Gets the current default connection state.

**Returns:**
```typescript
interface SessionState {
  defaultInstance?: string;
  defaultBranch?: string;
}
```

**Example:**
```typescript
import { getDefaultConnection } from './session.js';

const session = getDefaultConnection();
console.log(session.defaultInstance); // "production"
console.log(session.defaultBranch); // "main"
```

---

## Utility Functions

### `src/utils.ts`

#### `safeJsonStringify(data: unknown, indent?: number): string`

Safely stringifies data that might contain malformed JSON strings.

**Parameters:**
- `data`: Data to stringify
- `indent`: Indentation level (default: 2)

**Returns:** JSON string

**Example:**
```typescript
import { safeJsonStringify } from './utils.js';

const data = { name: 'John', age: 30 };
const json = safeJsonStringify(data);
console.log(json);
```

---

#### `resolveConnection(args: { instance?: string; branch?: string }): { instance: string | undefined; branch: string | undefined; autoSelected: boolean }`

Resolves instance and branch, auto-selecting defaults if needed.

**Parameters:**
- `args`: Connection arguments

**Returns:** Resolved connection with auto-selection flag

**Example:**
```typescript
import { resolveConnection } from './utils.js';

const resolved = resolveConnection({ instance: 'production' });
console.log(resolved.instance); // "production"
console.log(resolved.autoSelected); // false
```

---

#### `getClientWithDefaults(args: { instance?: string; branch?: string }): { client: Client | null; instance: string | undefined; branch: string | undefined; autoSelected: boolean }`

Gets a database client with automatic connection resolution.

**Parameters:**
- `args`: Connection arguments

**Returns:** Client and connection info

**Example:**
```typescript
import { getClientWithDefaults } from './utils.js';

const { client, instance, branch, autoSelected } = getClientWithDefaults({});
if (client) {
  // Use client...
}
```

---

#### `validateConnectionArgs(args: { instance?: string; branch?: string }): void`

Validates optional instance and branch names when provided.

**Parameters:**
- `args`: Connection arguments

**Throws:** `ValidationError` if validation fails

**Example:**
```typescript
import { validateConnectionArgs } from './utils.js';

try {
  validateConnectionArgs({ instance: 'production', branch: 'main' });
} catch (error) {
  // Handle validation error
}
```

---

#### `formatJsonForOutput(data: unknown, maxLength?: number): string`

Formats JSON data for MCP text output with truncation and code fencing.

**Parameters:**
- `data`: Data to format
- `maxLength`: Maximum length before truncation (default: 20000)

**Returns:** Formatted JSON string

**Example:**
```typescript
import { formatJsonForOutput } from './utils.js';

const formatted = formatJsonForOutput({ name: 'John', age: 30 });
console.log(formatted);
```

---

#### `buildToolResponse(options: { status: "success" | "error" | "info" | "warn"; title: string; statusMessage?: string; textSections?: string[]; jsonData?: unknown }): { content: Array<{ type: "text"; text: string }> }`

Standardized tool response builder.

**Parameters:**
- `options.status`: Response status
- `options.title`: Response title
- `options.statusMessage`: Optional status message
- `options.textSections`: Optional text sections
- `options.jsonData`: Optional JSON data

**Returns:** MCP tool response

**Example:**
```typescript
import { buildToolResponse } from './utils.js';

const response = buildToolResponse({
  status: 'success',
  title: 'Query executed',
  jsonData: { result: 'success' }
});
```

---

#### `getConnectionStatusMessage(instance: string, branch: string | undefined, autoSelected: boolean): string`

Generates a status message showing which instance/branch is being used.

**Parameters:**
- `instance`: Instance name
- `branch`: Branch name (optional)
- `autoSelected`: Whether connection was auto-selected

**Returns:** Status message string

**Example:**
```typescript
import { getConnectionStatusMessage } from './utils.js';

const message = getConnectionStatusMessage('production', 'main', false);
console.log(message); // " (using instance: production/main)"
```

---

## Error Handling

### Error Classes (`src/errors.ts`)

All errors extend `MCPError` base class:

```typescript
abstract class MCPError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly context?: Record<string, unknown>;
  readonly cause?: Error;
  
  toMCPResponse(): { content: Array<{ type: "text"; text: string }> };
}
```

#### Available Error Types:

1. **`DatabaseError`** - Database connection/operation errors
   - Code: `DATABASE_ERROR`
   - Status: 500

2. **`ValidationError`** - Input validation errors
   - Code: `VALIDATION_ERROR`
   - Status: 400
   - Fields: `field`, `value`

3. **`AuthenticationError`** - Authentication/authorization errors
   - Code: `AUTHENTICATION_ERROR`
   - Status: 401

4. **`RateLimitError`** - Rate limiting errors
   - Code: `RATE_LIMIT_ERROR`
   - Status: 429
   - Fields: `retryAfter`

5. **`ConfigurationError`** - Configuration errors
   - Code: `CONFIGURATION_ERROR`
   - Status: 500

6. **`SecurityError`** - Security violations
   - Code: `SECURITY_ERROR`
   - Status: 403

7. **`TimeoutError`** - Operation timeout errors
   - Code: `TIMEOUT_ERROR`
   - Status: 408
   - Fields: `timeoutMs`

8. **`NotFoundError`** - Resource not found errors
   - Code: `NOT_FOUND_ERROR`
   - Status: 404

9. **`ExternalServiceError`** - External service errors
   - Code: `EXTERNAL_SERVICE_ERROR`
   - Status: 502

10. **`InternalServerError`** - Internal server errors
    - Code: `INTERNAL_SERVER_ERROR`
    - Status: 500

#### Error Utilities:

**`handleError(error: unknown, defaultMessage?: string): MCPError`**

Converts any error to standardized format.

**Example:**
```typescript
import { handleError } from './errors.js';

try {
  // Some operation
} catch (error) {
  const mcpError = handleError(error, 'Operation failed');
  return mcpError.toMCPResponse();
}
```

---

**`wrapToolFunction<T extends unknown[], R>(fn: (...args: T) => Promise<R>, defaultErrorMessage?: string): (...args: T) => Promise<R | { content: Array<{ type: "text"; text: string }> }>`**

Wraps an async tool function with error handling.

**Example:**
```typescript
import { wrapToolFunction } from './errors.js';

const safeTool = wrapToolFunction(async (args) => {
  // Tool implementation
  return result;
});
```

---

**`createSuccessResponse(message: string, data?: unknown): { content: Array<{ type: "text"; text: string }> }`**

Creates a success response.

**Example:**
```typescript
import { createSuccessResponse } from './errors.js';

return createSuccessResponse('Operation completed', { result: 'success' });
```

---

**`createWarningResponse(message: string, details?: string): { content: Array<{ type: "text"; text: string }> }`**

Creates a warning response.

**Example:**
```typescript
import { createWarningResponse } from './errors.js';

return createWarningResponse('Operation completed with warnings', 'Some details');
```

---

**`createInfoResponse(message: string, data?: unknown): { content: Array<{ type: "text"; text: string }> }`**

Creates an info response.

**Example:**
```typescript
import { createInfoResponse } from './errors.js';

return createInfoResponse('Information', { data: 'value' });
```

---

## Configuration

### Configuration API (`src/config.ts`)

#### `loadConfig(): Config`

Loads configuration from file or environment variables.

**Returns:** Configuration object

**Example:**
```typescript
import { loadConfig } from './config.js';

const config = loadConfig();
console.log(config.server.port); // 3000
```

---

#### `getConfig(): Config`

Gets current configuration (loads if not already loaded).

**Returns:** Configuration object

**Example:**
```typescript
import { getConfig } from './config.js';

const config = getConfig();
```

---

#### `reloadConfig(): Config`

Reloads configuration from file.

**Returns:** Configuration object

**Example:**
```typescript
import { reloadConfig } from './config.js';

const config = reloadConfig();
```

---

#### `createSampleConfig(): void`

Creates a sample configuration file.

**Example:**
```typescript
import { createSampleConfig } from './config.js';

createSampleConfig(); // Creates gel-mcp-config.json.example
```

---

### Configuration Schema

```typescript
interface Config {
  server: {
    port: number; // Default: 3000
    host: string; // Default: "localhost"
    timeout: number; // Default: 30000
  };
  database: {
    defaultInstance?: string;
    defaultBranch: string; // Default: "main"
    connectionTimeout: number; // Default: 10000
    queryTimeout: number; // Default: 30000
  };
  schemaWatcher: {
    enabled: boolean; // Default: true
    maxRetries: number; // Default: 3
    retryDelay: number; // Default: 5000
    watchTimeout: number; // Default: 60000
  };
  security: {
    executeTypescript: {
      enabled: boolean; // Default: true
      timeout: number; // Default: 30000
      memoryLimit: number; // Default: 128 (MB)
      maxCodeLength: number; // Default: 10000
      allowedModules: string[];
      blockedPatterns: string[];
    };
    rateLimit: {
      enabled: boolean; // Default: true
      windowMs: number; // Default: 60000
      maxRequests: number; // Default: 100
      executeToolsLimit: number; // Default: 10
    };
  };
  logging: {
    level: "error" | "warn" | "info" | "debug"; // Default: "info"
    maxFiles: number; // Default: 5
    maxSize: number; // Default: 5242880 (5MB)
    enableConsole: boolean; // Default: true
  };
  tools: {
    validation: {
      strictMode: boolean; // Default: true
      maxQueryLength: number; // Default: 50000
      allowedSchemaPatterns: string[];
    };
  };
}
```

---

## Validation

### Validation API (`src/validation.ts`)

#### `validateInstanceName(instanceName: string): void`

Validates an instance name.

**Parameters:**
- `instanceName`: Instance name to validate

**Throws:** `ValidationError` if invalid

**Rules:**
- 1-100 characters
- Only letters, numbers, underscores, and hyphens

**Example:**
```typescript
import { validateInstanceName } from './validation.js';

try {
  validateInstanceName('production');
} catch (error) {
  // Handle error
}
```

---

#### `validateBranchName(branchName: string): void`

Validates a branch name.

**Parameters:**
- `branchName`: Branch name to validate

**Throws:** `ValidationError` if invalid

**Rules:**
- 1-100 characters
- Only letters, numbers, underscores, hyphens, and slashes

**Example:**
```typescript
import { validateBranchName } from './validation.js';

try {
  validateBranchName('main');
} catch (error) {
  // Handle error
}
```

---

#### `validateSchemaTypeName(typeName: string): void`

Validates a schema type name.

**Parameters:**
- `typeName`: Type name to validate

**Throws:** `ValidationError` if invalid

**Rules:**
- 1-200 characters
- Must start with letter or underscore
- Followed by letters, numbers, or underscores

**Example:**
```typescript
import { validateSchemaTypeName } from './validation.js';

try {
  validateSchemaTypeName('User');
} catch (error) {
  // Handle error
}
```

---

#### `validateTypeScriptCode(code: string): void`

Validates TypeScript code for execution.

**Parameters:**
- `code`: Code to validate

**Throws:** `ValidationError` if invalid

**Checks:**
- Code length limits
- Blocked patterns
- Code injection patterns

**Example:**
```typescript
import { validateTypeScriptCode } from './validation.js';

try {
  validateTypeScriptCode('const x = 1;');
} catch (error) {
  // Handle error
}
```

---

#### `sanitizeString(input: string, maxLength?: number): string`

Sanitizes string input by removing potentially dangerous characters.

**Parameters:**
- `input`: String to sanitize
- `maxLength`: Maximum length (default: 1000)

**Returns:** Sanitized string

**Example:**
```typescript
import { sanitizeString } from './validation.js';

const sanitized = sanitizeString('<script>alert("xss")</script>');
console.log(sanitized); // "scriptalertxssscript"
```

---

#### `validateQueryArgs(args: Record<string, unknown>): Record<string, unknown>`

Validates and sanitizes query arguments.

**Parameters:**
- `args`: Query arguments to validate

**Returns:** Sanitized arguments

**Throws:** `ValidationError` if invalid

**Example:**
```typescript
import { validateQueryArgs } from './validation.js';

const sanitized = validateQueryArgs({
  email: 'user@example.com',
  age: 30
});
```

---

#### `checkRateLimit(identifier: string, isExecuteTool?: boolean): void`

Checks rate limit for a given identifier.

**Parameters:**
- `identifier`: Rate limit identifier
- `isExecuteTool`: Whether this is an execute tool (default: false)

**Throws:** `RateLimitError` if limit exceeded

**Example:**
```typescript
import { checkRateLimit } from './validation.js';

try {
  checkRateLimit('user-123', true);
} catch (error) {
  // Handle rate limit error
}
```

---

#### `getRateLimitStatus(identifier: string): { count: number; executeCount: number; resetTime: number; remaining: number; executeRemaining: number }`

Gets rate limit status for debugging.

**Parameters:**
- `identifier`: Rate limit identifier

**Returns:** Rate limit status object

**Example:**
```typescript
import { getRateLimitStatus } from './validation.js';

const status = getRateLimitStatus('user-123');
console.log(status.remaining); // 95
```

---

#### `setRateLimitStore(store: RateLimitStore): void`

Sets a custom rate limit store.

**Parameters:**
- `store`: Rate limit store implementation

**Example:**
```typescript
import { setRateLimitStore } from './validation.js';

class CustomStore implements RateLimitStore {
  // Implementation
}

setRateLimitStore(new CustomStore());
```

---

### Validation Schemas

#### `InstanceNameSchema`

Zod schema for instance name validation.

**Example:**
```typescript
import { InstanceNameSchema } from './validation.js';

const result = InstanceNameSchema.parse('production');
```

---

#### `BranchNameSchema`

Zod schema for branch name validation.

**Example:**
```typescript
import { BranchNameSchema } from './validation.js';

const result = BranchNameSchema.parse('main');
```

---

#### `SchemaTypeNameSchema`

Zod schema for schema type name validation.

**Example:**
```typescript
import { SchemaTypeNameSchema } from './validation.js';

const result = SchemaTypeNameSchema.parse('User');
```

---

## Logging

### Logger API (`src/logger.ts`)

#### `createLogger(context: string): Logger`

Creates a logger instance for a specific context.

**Parameters:**
- `context`: Logger context name

**Returns:** Logger instance

**Logger Methods:**
- `error(message: string, meta?: Record<string, unknown>): void`
- `warn(message: string, meta?: Record<string, unknown>): void`
- `info(message: string, meta?: Record<string, unknown>): void`
- `debug(message: string, meta?: Record<string, unknown>): void`
- `log(level: string, message: string, meta?: Record<string, unknown>): void`

**Example:**
```typescript
import { createLogger } from './logger.js';

const logger = createLogger('my-module');
logger.info('Operation started', { userId: 123 });
logger.error('Operation failed', { error: 'Details' });
```

---

## HTTP Server

### HTTP Server API (`src/http.ts`)

#### `startHttpServer(): Promise<void>`

Starts the HTTP server.

**Example:**
```typescript
import { startHttpServer } from './http.js';

await startHttpServer();
```

---

#### `registerHttpRoutes(fastify: FastifyInstance): void`

Registers HTTP routes on a Fastify instance.

**Routes:**
- `GET /health`: Health check endpoint

**Example:**
```typescript
import { registerHttpRoutes } from './http.js';
import fastify from 'fastify';

const server = fastify();
registerHttpRoutes(server);
```

---

### Health Check Endpoint

**Endpoint:** `GET /health`

**Response:**
```typescript
{
  status: "ok";
  timestamp: string; // ISO timestamp
  connection: {
    defaultInstance: string | null;
    defaultBranch: string | null;
  };
  schemaWatcher: {
    status: "running" | "stopped";
    currentConnection: {
      instance?: string;
      branch?: string;
    } | null;
    retryCount: number;
  };
}
```

---

## Events

### Events API (`src/events.ts`)

#### `onConnectionChanged(listener: (payload: { instance?: string; branch?: string }) => void): void`

Subscribes to connection change events.

**Parameters:**
- `listener`: Event listener function

**Example:**
```typescript
import { onConnectionChanged } from './events.js';

onConnectionChanged(({ instance, branch }) => {
  console.log(`Connection changed: ${instance}/${branch}`);
});
```

---

#### `emitConnectionChanged(payload: { instance?: string; branch?: string }): void`

Emits a connection change event.

**Parameters:**
- `payload`: Connection change payload

**Example:**
```typescript
import { emitConnectionChanged } from './events.js';

emitConnectionChanged({ instance: 'production', branch: 'main' });
```

---

#### `offConnectionChanged(listener: (payload: { instance?: string; branch?: string }) => void): void`

Unsubscribes from connection change events.

**Parameters:**
- `listener`: Event listener function to remove

**Example:**
```typescript
import { offConnectionChanged } from './events.js';

const listener = ({ instance, branch }) => {
  console.log(`Connection changed: ${instance}/${branch}`);
};

onConnectionChanged(listener);
// Later...
offConnectionChanged(listener);
```

---

## Schema Watcher

### Schema Watcher API (`src/schemaWatcher.ts`)

#### `startSchemaWatcher(instance?: string, branch?: string): void`

Starts the schema watcher for an instance and branch.

**Parameters:**
- `instance`: Instance name (optional)
- `branch`: Branch name (optional)

**Example:**
```typescript
import { startSchemaWatcher } from './schemaWatcher.js';

startSchemaWatcher('production', 'main');
```

---

#### `stopSchemaWatcher(): void`

Stops the current schema watcher.

**Example:**
```typescript
import { stopSchemaWatcher } from './schemaWatcher.js';

stopSchemaWatcher();
```

---

#### `updateSchemaWatcher(): void`

Updates the schema watcher based on current default connection.

**Example:**
```typescript
import { updateSchemaWatcher } from './schemaWatcher.js';

updateSchemaWatcher();
```

---

#### `getSchemaWatcherStatus(): { status: "running" | "stopped"; currentConnection: { instance?: string; branch?: string } | null; retryCount: number }`

Gets the current schema watcher status.

**Returns:** Schema watcher status object

**Example:**
```typescript
import { getSchemaWatcherStatus } from './schemaWatcher.js';

const status = getSchemaWatcherStatus();
console.log(status.status); // "running" | "stopped"
```

---

## Application Entry Points

### Main Entry Point (`src/index.ts`)

#### `main(): Promise<void>`

Main entry point for stdio mode.

**Example:**
```typescript
import { main } from './index.js';

main().catch(console.error);
```

---

### App Creation (`src/app.ts`)

#### `createApp(): McpServer`

Creates and configures the MCP server instance.

**Returns:** Configured MCP server

**Example:**
```typescript
import { createApp } from './app.js';

const server = createApp();
```

---

## Usage Examples

### Complete Workflow Example

```typescript
// 1. Set up connection
import { setDefaultConnection } from './session.js';
setDefaultConnection('production', 'main');

// 2. Get database client
import { getDatabaseClient } from './database.js';
const client = getDatabaseClient({ instance: 'production', branch: 'main' });

// 3. Execute query
if (client) {
  const result = await client.query('SELECT User { name, email } LIMIT 10');
  console.log(result);
}

// 4. Validate query
import { validateQueryArgs } from './validation.js';
const sanitized = validateQueryArgs({ email: 'user@example.com' });

// 5. Handle errors
import { handleError } from './errors.js';
try {
  // Operation
} catch (error) {
  const mcpError = handleError(error);
  console.error(mcpError.message);
}
```

---

### Tool Registration Example

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wrapToolFunction, createSuccessResponse } from "./errors.js";

export function registerMyTool(server: McpServer) {
  server.registerTool(
    "my-tool",
    {
      title: "My Tool",
      description: "Description of my tool",
      inputSchema: {
        param1: z.string(),
        param2: z.number().optional(),
      },
    },
    wrapToolFunction(async (args) => {
      // Tool implementation
      return createSuccessResponse("Tool executed successfully", { result: "data" });
    })
  );
}
```

---

## Environment Variables

The following environment variables can be used to configure the server:

- `GEL_PROJECT_ROOT`: Override project root directory
- `GEL_MCP_PORT`: Server port (default: 3000)
- `GEL_MCP_HOST`: Server host (default: localhost)
- `GEL_MCP_TIMEOUT`: Server timeout (default: 30000)
- `GEL_DEFAULT_INSTANCE`: Default database instance
- `GEL_DEFAULT_BRANCH`: Default branch (default: main)
- `GEL_CONNECTION_TIMEOUT`: Connection timeout (default: 10000)
- `GEL_QUERY_TIMEOUT`: Query timeout (default: 30000)
- `GEL_SCHEMA_WATCHER_ENABLED`: Enable schema watcher (true/false)
- `GEL_SCHEMA_WATCHER_MAX_RETRIES`: Max retries (default: 3)
- `GEL_SCHEMA_WATCHER_RETRY_DELAY`: Retry delay in ms (default: 5000)
- `GEL_EXECUTE_TYPESCRIPT_ENABLED`: Enable TypeScript execution (true/false)
- `GEL_EXECUTE_TYPESCRIPT_TIMEOUT`: Execution timeout (default: 30000)
- `GEL_EXECUTE_TYPESCRIPT_MEMORY_LIMIT`: Memory limit in MB (default: 128)
- `GEL_RATE_LIMIT_ENABLED`: Enable rate limiting (true/false)
- `GEL_RATE_LIMIT_MAX_REQUESTS`: Max requests per window (default: 100)
- `GEL_RATE_LIMIT_EXECUTE_TOOLS`: Max execute tools per window (default: 10)
- `LOG_LEVEL`: Logging level (error, warn, info, debug)
- `GEL_LOG_CONSOLE`: Enable console logging (true/false)
- `NODE_ENV`: Environment (production, development, etc.)

---

## Type Definitions

### Common Types

```typescript
// Session state
interface SessionState {
  defaultInstance?: string;
  defaultBranch?: string;
}

// Session options
interface SessionOptions {
  instance?: string;
  branch?: string;
}

// Tool response
type ToolResponse =
  | { type: "success"; message: string; data?: unknown }
  | { type: "warn"; message: string; data?: unknown }
  | { type: "error"; message: string; data?: unknown }
  | { type: "info"; message: string; data?: unknown };

// Rate limit store
interface RateLimitStore {
  get(key: string): RateLimitState | undefined;
  set(key: string, value: RateLimitState): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, RateLimitState]>;
}

// Rate limit state
type RateLimitState = {
  count: number;
  resetTime: number;
  executeCount: number;
};
```

---

## Best Practices

1. **Always validate inputs** before using them
2. **Use error handling** with `wrapToolFunction` or `handleError`
3. **Set default connections** before executing queries
4. **Use rate limiting** for execute tools
5. **Sanitize user inputs** before database operations
6. **Use connection status messages** to inform users
7. **Handle errors gracefully** with appropriate error types
8. **Use logging** for debugging and monitoring
9. **Follow schema-first workflow** when exploring databases
10. **Validate queries** before execution

---

## Security Considerations

1. **Input Validation**: All inputs are validated using Zod schemas
2. **Rate Limiting**: Execute tools have stricter rate limits
3. **Code Execution**: TypeScript execution is sandboxed with `isolated-vm`
4. **Query Sanitization**: Query arguments are sanitized before use
5. **Pattern Blocking**: Dangerous code patterns are blocked
6. **Memory Limits**: Code execution has memory limits
7. **Timeouts**: Operations have configurable timeouts
8. **DNS Rebinding Protection**: HTTP server has DNS rebinding protection

---

## Troubleshooting

### Common Issues

1. **"Database client could not be initialized"**
   - Check that instance credentials exist
   - Verify instance name is correct
   - Ensure database is accessible

2. **"No instances available"**
   - Create `instance_credentials/` directory
   - Add JSON credential files
   - Use `gel` CLI to generate credentials

3. **"Type not found"**
   - List types with `schema action="types"`
   - Check type name casing
   - Verify instance/branch is correct

4. **Rate limit errors**
   - Wait for rate limit window to reset
   - Reduce request frequency
   - Check rate limit configuration

5. **Validation errors**
   - Check input format
   - Verify required fields
   - Review validation rules

---

## Additional Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Gel (EdgeDB) Documentation](https://docs.edgedb.com/)
- [EdgeQL Query Builder](https://docs.edgedb.com/libraries/js/querybuilder)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

## Version Information

- **Server Version:** 1.2.0
- **MCP SDK Version:** ^1.4.0
- **Gel Version:** ^2.0.0

---

*Last Updated: Generated automatically*
