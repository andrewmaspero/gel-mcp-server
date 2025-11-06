# Gel MCP Server - Comprehensive API Documentation

This document provides comprehensive documentation for all public APIs, functions, and components in the Gel MCP Server.

## Table of Contents

1. [MCP Tools](#mcp-tools)
2. [MCP Prompts](#mcp-prompts)
3. [Core Database APIs](#core-database-apis)
4. [Utility Functions](#utility-functions)
5. [Validation APIs](#validation-apis)
6. [Error Handling](#error-handling)
7. [Configuration APIs](#configuration-apis)
8. [Session Management](#session-management)
9. [Event System](#event-system)
10. [HTTP Server APIs](#http-server-apis)
11. [Logging APIs](#logging-apis)
12. [Cache APIs](#cache-apis)

---

## MCP Tools

MCP Tools are the primary interface for interacting with the Gel MCP Server. All tools follow the Model Context Protocol specification.

### `connection`

Consolidated connection management tool supporting multiple actions.

**Tool Name:** `connection`

**Description:** Manages database connections, instances, branches, and credentials.

**Input Schema:**
```typescript
{
  action?: "auto" | "set" | "get" | "listInstances" | "listCredentials" | "listBranches" | "switchBranch";
  instance?: string;
  branch?: string;
}
```

**Actions:**

#### `auto` (default)
Automatically selects and sets a default connection if none is configured.

**Example:**
```json
{
  "action": "auto"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Auto-selected default connection\n\n```json\n{\n  \"defaultInstance\": \"production\",\n  \"defaultBranch\": \"main\"\n}\n```"
    }
  ]
}
```

#### `set`
Sets the default instance and/or branch for the session.

**Example:**
```json
{
  "action": "set",
  "instance": "production",
  "branch": "main"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Default connection updated\n\n```json\n{\n  \"defaultInstance\": \"production\",\n  \"defaultBranch\": \"main\"\n}\n```"
    }
  ]
}
```

#### `get`
Retrieves the current default connection settings.

**Example:**
```json
{
  "action": "get"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "ℹ️ Current default connection\n\n```json\n{\n  \"defaultInstance\": \"production\",\n  \"defaultBranch\": \"main\"\n}\n```"
    }
  ]
}
```

#### `listInstances` / `listCredentials`
Lists all available database instances discovered from credential files.

**Example:**
```json
{
  "action": "listInstances"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Found 2 instance(s)\n\n```json\n[\"production\", \"staging\"]\n```\n\nNext: set a default connection:\n@[connection action=\"set\" instance=\"<NAME>\" branch=\"main\"]"
    }
  ]
}
```

#### `listBranches`
Lists all branches available for a specific instance.

**Example:**
```json
{
  "action": "listBranches",
  "instance": "production"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Branches for 'production'\n\n```json\n[\n  {\"name\": \"main\", \"current\": true},\n  {\"name\": \"feature-x\", \"current\": false}\n]\n```\n\nNext: switch:\n@[connection action=\"switchBranch\" branch=\"<NAME>\"]"
    }
  ]
}
```

#### `switchBranch`
Switches the active branch for an instance.

**Example:**
```json
{
  "action": "switchBranch",
  "instance": "production",
  "branch": "feature-x"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Switched to branch 'feature-x' on 'production'"
    }
  ]
}
```

**Error Handling:**
- Invalid instance/branch names return validation errors
- Missing instances return warnings with guidance
- Rate limiting applies to all connection operations

---

### `schema`

Consolidated schema exploration and management tool.

**Tool Name:** `schema`

**Description:** Provides schema overview, type listing, type description, and schema refresh capabilities.

**Input Schema:**
```typescript
{
  action?: "overview" | "types" | "describe" | "refresh";
  typeName?: string;
  instance?: string;
  branch?: string;
  topK?: number;
}
```

**Actions:**

#### `overview` (default)
Returns a comprehensive schema overview including all object types and their relationships.

**Example:**
```json
{
  "action": "overview"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Schema overview (using instance: production/main)\n\n```json\n{\n  \"overview\": [...],\n  \"types\": [\"User\", \"Post\", \"Comment\"]\n}\n```\n\nDetected 3 type(s). Example: User, Post, Comment\nNext: describe a type or validate a simple query:\n@[schema action=\"describe\" typeName=\"<Type>\"]\n@[validate-query query=\"SELECT <Type>\"]"
    }
  ]
}
```

#### `types`
Lists all schema types in the database.

**Example:**
```json
{
  "action": "types",
  "topK": 30
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Schema types (using instance: production/main)\n\n```json\n{\n  \"types\": [\"User\", \"Post\", \"Comment\"]\n}\n```\n\nFound 3 type(s). Showing first 3:\nUser, Post, Comment\nSuggested next step: describe a type (replace <Type>):\n@[schema action=\"describe\" typeName=\"<Type>\"]"
    }
  ]
}
```

#### `describe`
Provides detailed information about a specific schema type including properties, links, and relationships.

**Example:**
```json
{
  "action": "describe",
  "typeName": "User"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Schema for 'User' (using instance: production/main)\n\n```json\n[\n  {\n    \"name\": \"default::User\",\n    \"properties\": [\n      {\"name\": \"id\", \"target\": {\"name\": \"uuid\"}, \"cardinality\": \"One\", \"required\": true},\n      {\"name\": \"email\", \"target\": {\"name\": \"str\"}, \"cardinality\": \"One\", \"required\": true}\n    ],\n    \"links\": [\n      {\"name\": \"posts\", \"target\": {\"name\": \"default::Post\"}, \"cardinality\": \"Many\", \"required\": false}\n    ]\n  }\n]\n```\n\nYou can now validate or run a query:\n@[query action=\"validate\" query=\"SELECT User\"]\n@[query action=\"run\" query=\"SELECT User\"]"
    }
  ]
}
```

#### `refresh`
Regenerates the EdgeQL query builder for a specific instance.

**Example:**
```json
{
  "action": "refresh",
  "instance": "production"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Regenerated query builder for 'production' (using instance: production/main)\n\nSchema generation completed"
    }
  ]
}
```

**Error Handling:**
- Missing `typeName` for `describe` action returns error
- Invalid type names return validation errors
- Type not found returns error with available types list
- Rate limiting applies to all schema operations

---

### `query`

Consolidated query execution and validation tool.

**Tool Name:** `query`

**Description:** Validates and executes EdgeQL queries with support for parameters, file execution, and result formatting.

**Input Schema:**
```typescript
{
  action?: "validate" | "run" | "file";
  query?: string;
  args?: Record<string, any>;
  filePath?: string;
  format?: "json" | "text";
  limit?: number;
  timeout?: number;
  dryRun?: boolean;
  instance?: string;
  branch?: string;
}
```

**Actions:**

#### `validate` (default)
Validates EdgeQL query syntax without executing it.

**Example:**
```json
{
  "action": "validate",
  "query": "SELECT User { id, email }"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Query is valid"
    }
  ]
}
```

**Example with parameters:**
```json
{
  "action": "validate",
  "query": "SELECT User FILTER .email = <str>$email",
  "args": {
    "email": "user@example.com"
  }
}
```

#### `run`
Executes an EdgeQL query and returns results.

**Example:**
```json
{
  "action": "run",
  "query": "SELECT User { id, email } LIMIT 10"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Query executed\n\n```json\n[\n  {\"id\": \"...\", \"email\": \"user@example.com\"}\n]\n```"
    }
  ]
}
```

**Example with automatic LIMIT:**
```json
{
  "action": "run",
  "query": "SELECT User",
  "limit": 50
}
```
The query will automatically have `LIMIT 50` appended if it's a SELECT query without an existing LIMIT clause.

**Example with text format:**
```json
{
  "action": "run",
  "query": "SELECT User LIMIT 5",
  "format": "text"
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"id\":\"...\",\"email\":\"user@example.com\"}\n{\"id\":\"...\",\"email\":\"user2@example.com\"}\n..."
    }
  ]
}
```

#### `file`
Executes an EdgeQL query from a file.

**Example:**
```json
{
  "action": "file",
  "filePath": "./queries/get_users.edgeql",
  "args": {
    "limit": 10
  }
}
```

**Features:**
- Automatic LIMIT application for SELECT queries (default: 50, max: 1000)
- Parameter sanitization and validation
- Support for both JSON and text output formats
- Transaction-based validation (rollback after validation)

**Error Handling:**
- Missing query/filePath returns error
- Invalid query syntax returns detailed error message
- Query execution errors return EdgeDB error details
- Rate limiting applies (stricter limits for execute operations)

---

### `docs`

Documentation search tool for local Gel documentation.

**Tool Name:** `docs`

**Description:** Searches local Gel documentation files using fuzzy matching.

**Input Schema:**
```typescript
{
  action?: "search";
  term: string;
  context_lines?: number; // default: 3
  match_all_terms?: boolean; // default: false
}
```

**Example:**
```json
{
  "action": "search",
  "term": "SELECT query",
  "context_lines": 5,
  "match_all_terms": false
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 matches for \"SELECT query\" (showing top 5):\n\n📄 **Match 1** (lines 10-30, relevance: 85.2%)\n```\n  10: SELECT statements are used to retrieve data...\n  15: SELECT User { id, email }\n  20: ...\n```\n\n..."
    }
  ]
}
```

**Features:**
- Fuzzy search using Fuse.js
- Configurable context lines around matches
- Option to match all terms (AND) vs any term (OR)
- Cached search index for performance
- Automatic index rebuild on file changes

**Documentation File Location:**
The tool searches for `gel_llm.txt` in:
1. Project root
2. `src/../gel_llm.txt`
3. Current working directory
4. `./gel_llm.txt`

---

## MCP Prompts

MCP Prompts provide guided workflows and best practices for using the Gel MCP Server.

### `bootstrap-connection`

**Title:** Bootstrap: Establish Connection & Verify

**Description:** Deterministically set default instance/branch and verify connectivity before any other operation.

**Args Schema:**
```typescript
{
  instance?: string;
  branch?: string;
}
```

**Usage:**
```
@bootstrap-connection instance="production" branch="main"
```

**Generated Prompt:**
Provides step-by-step instructions for:
1. Checking current connection
2. Listing available instances
3. Listing branches
4. Setting default connection
5. Verifying connectivity

---

### `schema-exploration`

**Title:** Schema Exploration (List → Describe → Plan)

**Description:** Enforce listing types and describing targets before crafting any EdgeQL.

**Usage:**
```
@schema-exploration
```

**Generated Prompt:**
Guides users through:
1. Listing schema types
2. Describing specific types
3. Planning queries based on actual schema
4. Avoiding guesswork

---

### `quickstart`

**Title:** Quickstart (Connection → Schema → Validate → Execute)

**Description:** Concise workflow covering connection setup, schema discovery, safe query workflow, and error recovery.

**Usage:**
```
@quickstart
```

**Generated Prompt:**
Provides complete workflow:
1. Connection setup
2. Schema-first approach
3. Safe query workflow (validate → execute)
4. Error recovery strategies

---

### `edgeql-workflow`

**Title:** EdgeQL Workflow (Validate → Execute)

**Description:** Enforce validation-first execution with safe argument handling and compact results.

**Args Schema:**
```typescript
{
  query: string;
}
```

**Usage:**
```
@edgeql-workflow query="SELECT User"
```

**Generated Prompt:**
Generates tool calls for:
1. Validating the query
2. Executing if valid
3. Error recovery if invalid

---

### `recovery-playbook`

**Title:** Recovery Playbook (Common Tool Errors)

**Description:** Map common tool errors to corrective actions.

**Usage:**
```
@recovery-playbook
```

**Generated Prompt:**
Provides mappings for:
- Database client initialization errors
- Type not found errors
- Invalid parameter errors
- Rate limiting errors

---

### `run-edgeql`

**Title:** Run EdgeQL (Guided)

**Description:** Produce the minimal, correct steps to validate then execute a single EdgeQL query.

**Args Schema:**
```typescript
{
  query: string;
  instance?: string;
  branch?: string;
}
```

**Usage:**
```
@run-edgeql query="SELECT User" instance="production"
```

**Generated Prompt:**
Generates tool calls with proper connection parameters.

---

### `gel-rag-bootstrap`

**Title:** Gel RAG Bootstrap (Context7)

**Description:** Always consult current Gel docs via Context7 before crafting queries or schema tweaks.

**Usage:**
```
@gel-rag-bootstrap
```

**Generated Prompt:**
Provides guidance on:
- Using Context7 library (/geldata/gel)
- Preferred search terms by intent
- Query vs schema documentation

---

### `gel-schema-principles`

**Title:** Gel Schema & Performance Principles (Essentials)

**Description:** Embed key schema and performance practices to guide planning and reviews.

**Usage:**
```
@gel-schema-principles
```

**Generated Prompt:**
Covers:
- Link vs computed backlink patterns
- Array vs multi scalar properties
- Polymorphic inheritance
- Indexing best practices
- Access policies

---

### `search-docs`

**Title:** Search Docs (Guided)

**Description:** Generate a call to search local documentation with context windows.

**Args Schema:**
```typescript
{
  term: string;
}
```

**Usage:**
```
@search-docs term="SELECT queries"
```

**Generated Prompt:**
Generates a `@[docs action="search"]` tool call.

---

### `gel-rag-suggest`

**Title:** Gel RAG Suggest (Context7 Search Terms)

**Description:** Given a natural goal, propose targeted Context7 search terms and ready-to-use calls.

**Args Schema:**
```typescript
{
  goal: string;
  intent?: "query" | "schema" | "both";
}
```

**Usage:**
```
@gel-rag-suggest goal="paginate a SELECT over Orders" intent="query"
```

**Generated Prompt:**
Suggests:
- Context7 search terms
- Local docs search terms
- Cross-referencing with live schema

---

## Core Database APIs

### `getDatabaseClient(options?: SessionOptions)`

Gets a database client for the specified instance and branch.

**Parameters:**
```typescript
interface SessionOptions {
  instance?: string;
  branch?: string;
}
```

**Returns:** `Client | null` - Gel database client or null if instance not available

**Example:**
```typescript
import { getDatabaseClient } from './database.js';

const client = getDatabaseClient({ instance: 'production', branch: 'main' });
if (client) {
  const result = await client.query('SELECT User');
}
```

**Behavior:**
- Uses session defaults if instance/branch not provided
- Returns null if no instance configured
- Creates client from credentials file: `instance_credentials/{instance}.json`

---

### `findProjectRoot(): string`

Finds the project root directory by walking up from current directory.

**Returns:** `string` - Absolute path to project root

**Example:**
```typescript
import { findProjectRoot } from './database.js';

const root = findProjectRoot();
console.log(root); // /workspace/gel-mcp-server
```

**Behavior:**
- Checks for `package.json` with name "gel-mcp-server"
- Looks for `src/` and `instance_credentials/` directories
- Falls back to `process.cwd()` if not found
- Caches result for performance
- Respects `GEL_PROJECT_ROOT` environment variable override

---

### `getAvailableInstances(): string[]`

Lists all available database instances from credential files.

**Returns:** `string[]` - Array of instance names

**Example:**
```typescript
import { getAvailableInstances } from './database.js';

const instances = getAvailableInstances();
console.log(instances); // ['production', 'staging']
```

**Behavior:**
- Scans `instance_credentials/` directory
- Returns filenames without `.json` extension
- Returns empty array if directory doesn't exist
- Handles errors gracefully

---

### `listInstances(): Promise<string[]>`

Async version of `getAvailableInstances()`.

**Returns:** `Promise<string[]>` - Promise resolving to array of instance names

---

### `listBranches(instance: string): Promise<string[]>`

Lists branches for a specific instance.

**Parameters:**
- `instance: string` - Instance name

**Returns:** `Promise<string[]>` - Promise resolving to array of branch names

**Note:** Currently returns `["main"]` as default. Full branch listing requires gel CLI integration.

---

### `initGelClient(): Promise<void>`

Initializes a Gel client based on default connection settings.

**Example:**
```typescript
import { initGelClient } from './database.js';

await initGelClient();
```

**Behavior:**
- Uses session default instance and branch
- Creates client from credentials file
- Logs connection status
- Stores client in connection pool

---

### `closeAllConnections(): Promise<void>`

Closes all active database connections.

**Example:**
```typescript
import { closeAllConnections } from './database.js';

await closeAllConnections();
```

**Behavior:**
- Closes all clients in connection pool
- Clears connection pool
- Called automatically on server shutdown

---

### `loadQueryBuilder(instance: string, branch?: string): Promise<Module | null>`

Loads the EdgeQL query builder module for a specific instance.

**Parameters:**
- `instance: string` - Instance name
- `branch: string` - Branch name (default: "main")

**Returns:** `Promise<Module | null>` - Query builder module or null if not found

**Example:**
```typescript
import { loadQueryBuilder } from './database.js';

const qb = await loadQueryBuilder('production', 'main');
if (qb) {
  const e = qb.default;
  // Use query builder
}
```

---

### `getDebugInfo(): { projectRoot: string; cwd: string; dirname: string }`

Returns debug information about file system paths.

**Returns:** Object with project root, current working directory, and module directory

**Example:**
```typescript
import { getDebugInfo } from './database.js';

const info = getDebugInfo();
console.log(info);
// {
//   projectRoot: '/workspace/gel-mcp-server',
//   cwd: '/workspace',
//   dirname: '/workspace/gel-mcp-server/build'
// }
```

---

## Utility Functions

### `resolveConnection(args: { instance?: string; branch?: string })`

Resolves instance and branch with automatic defaults.

**Parameters:**
```typescript
{
  instance?: string;
  branch?: string;
}
```

**Returns:**
```typescript
{
  instance: string | undefined;
  branch: string | undefined;
  autoSelected: boolean;
}
```

**Example:**
```typescript
import { resolveConnection } from './utils.js';

const { instance, branch, autoSelected } = resolveConnection({
  instance: 'production'
});
```

**Behavior:**
- Uses provided args if available
- Falls back to session defaults
- Auto-selects first available instance if none configured
- Sets branch to "main" if not specified

---

### `getClientWithDefaults(args: { instance?: string; branch?: string })`

Gets a database client with automatic connection resolution.

**Parameters:**
```typescript
{
  instance?: string;
  branch?: string;
}
```

**Returns:**
```typescript
{
  client: Client | null;
  instance: string | undefined;
  branch: string | undefined;
  autoSelected: boolean;
}
```

**Example:**
```typescript
import { getClientWithDefaults } from './utils.js';

const { client, instance, branch } = getClientWithDefaults({
  instance: 'production'
});

if (client) {
  const result = await client.query('SELECT User');
}
```

---

### `validateConnectionArgs(args: { instance?: string; branch?: string }): void`

Validates optional instance and branch names.

**Parameters:**
```typescript
{
  instance?: string;
  branch?: string;
}
```

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

### `buildToolResponse(options: ToolResponseOptions)`

Builds a standardized MCP tool response.

**Parameters:**
```typescript
interface ToolResponseOptions {
  status: "success" | "error" | "info" | "warn";
  title: string;
  statusMessage?: string;
  textSections?: string[];
  jsonData?: unknown;
}
```

**Returns:**
```typescript
{
  content: Array<{ type: "text"; text: string }>;
}
```

**Example:**
```typescript
import { buildToolResponse } from './utils.js';

const response = buildToolResponse({
  status: 'success',
  title: 'Operation completed',
  jsonData: { result: 'data' },
  textSections: ['Additional information']
});
```

**Features:**
- Adds emoji based on status (✅ ❌ ℹ️ ⚠️)
- Formats JSON data with code fences
- Supports multiple text sections
- Includes status message for connection info

---

### `getConnectionStatusMessage(instance: string, branch: string | undefined, autoSelected: boolean): string`

Generates a status message showing which instance/branch is being used.

**Parameters:**
- `instance: string` - Instance name
- `branch: string | undefined` - Branch name
- `autoSelected: boolean` - Whether connection was auto-selected

**Returns:** `string` - Status message

**Example:**
```typescript
import { getConnectionStatusMessage } from './utils.js';

const msg = getConnectionStatusMessage('production', 'main', false);
// "(using instance: production/main)"
```

---

### `safeJsonStringify(data: unknown, indent?: number): string`

Safely stringifies data that might contain malformed JSON.

**Parameters:**
- `data: unknown` - Data to stringify
- `indent: number` - Indentation level (default: 2)

**Returns:** `string` - JSON string

**Example:**
```typescript
import { safeJsonStringify } from './utils.js';

const json = safeJsonStringify({ data: 'value' });
```

**Behavior:**
- Handles circular references
- Cleans malformed strings
- Falls back to safe string representation on failure

---

### `formatJsonForOutput(data: unknown, maxLength?: number): string`

Formats JSON data for MCP text output with truncation.

**Parameters:**
- `data: unknown` - Data to format
- `maxLength: number` - Maximum length (default: 20000)

**Returns:** `string` - Formatted JSON with code fences

**Example:**
```typescript
import { formatJsonForOutput } from './utils.js';

const formatted = formatJsonForOutput({ large: 'data' }, 1000);
// "\n\n```json\n{...}\n```"
```

---

## Validation APIs

### `validateInstanceName(instanceName: string): void`

Validates an instance name.

**Parameters:**
- `instanceName: string` - Instance name to validate

**Throws:** `ValidationError` if invalid

**Validation Rules:**
- 1-100 characters
- Only letters, numbers, underscores, and hyphens
- Regex: `/^[a-zA-Z0-9_-]+$/`

**Example:**
```typescript
import { validateInstanceName } from './validation.js';

try {
  validateInstanceName('production');
} catch (error) {
  // Handle validation error
}
```

---

### `validateBranchName(branchName: string): void`

Validates a branch name.

**Parameters:**
- `branchName: string` - Branch name to validate

**Throws:** `ValidationError` if invalid

**Validation Rules:**
- 1-100 characters
- Letters, numbers, underscores, hyphens, and slashes
- Regex: `/^[a-zA-Z0-9_/-]+$/`

**Example:**
```typescript
import { validateBranchName } from './validation.js';

try {
  validateBranchName('feature/user-auth');
} catch (error) {
  // Handle validation error
}
```

---

### `validateSchemaTypeName(typeName: string): void`

Validates a schema type name.

**Parameters:**
- `typeName: string` - Type name to validate

**Throws:** `ValidationError` if invalid

**Validation Rules:**
- 1-200 characters
- Must start with letter or underscore
- Only letters, numbers, and underscores
- Regex: `/^[a-zA-Z_][a-zA-Z0-9_]*$/`

**Example:**
```typescript
import { validateSchemaTypeName } from './validation.js';

try {
  validateSchemaTypeName('User');
} catch (error) {
  // Handle validation error
}
```

---

### `validateQueryArgs(args: Record<string, unknown>): Record<string, unknown>`

Validates and sanitizes query arguments.

**Parameters:**
- `args: Record<string, unknown>` - Query arguments

**Returns:** `Record<string, unknown>` - Sanitized arguments

**Throws:** `ValidationError` if validation fails

**Example:**
```typescript
import { validateQueryArgs } from './validation.js';

const sanitized = validateQueryArgs({
  email: 'user@example.com',
  limit: 10
});
```

**Behavior:**
- Validates argument key names
- Sanitizes string values
- Preserves numbers, booleans, null
- Sanitizes arrays recursively
- Converts complex objects to sanitized strings

---

### `validateTypeScriptCode(code: string): void`

Validates TypeScript code for safe execution.

**Parameters:**
- `code: string` - TypeScript code to validate

**Throws:** `ValidationError` if validation fails

**Validation Rules:**
- TypeScript execution must be enabled in config
- Code length must be within limits
- Checks for blocked patterns (fs, process, require, etc.)
- Checks for code injection patterns

**Example:**
```typescript
import { validateTypeScriptCode } from './validation.js';

try {
  validateTypeScriptCode('const result = await gelClient.query("SELECT User");');
} catch (error) {
  // Handle validation error
}
```

---

### `sanitizeString(input: string, maxLength?: number): string`

Sanitizes string input by removing dangerous characters.

**Parameters:**
- `input: string` - String to sanitize
- `maxLength: number` - Maximum length (default: 1000)

**Returns:** `string` - Sanitized string

**Example:**
```typescript
import { sanitizeString } from './validation.js';

const clean = sanitizeString('<script>alert("xss")</script>');
// "scriptalertxssscript"
```

**Behavior:**
- Removes HTML/XML dangerous characters (`< > " ' &`)
- Removes control characters
- Truncates to maxLength
- Preserves printable ASCII and extended characters

---

### `checkRateLimit(identifier: string, isExecuteTool?: boolean): void`

Checks rate limit for a given identifier.

**Parameters:**
- `identifier: string` - Rate limit identifier (e.g., tool name)
- `isExecuteTool: boolean` - Whether this is an execute tool (default: false)

**Throws:** `RateLimitError` if limit exceeded

**Example:**
```typescript
import { checkRateLimit } from './validation.js';

try {
  checkRateLimit('query', true);
} catch (error) {
  // Handle rate limit error
}
```

**Behavior:**
- Uses sliding window rate limiting
- Separate limits for execute tools
- Automatic cleanup of expired entries
- Configurable via config file

---

### `getRateLimitStatus(identifier: string)`

Gets current rate limit status for debugging.

**Parameters:**
- `identifier: string` - Rate limit identifier

**Returns:**
```typescript
{
  count: number;
  executeCount: number;
  resetTime: number;
  remaining: number;
  executeRemaining: number;
}
```

**Example:**
```typescript
import { getRateLimitStatus } from './validation.js';

const status = getRateLimitStatus('query');
console.log(`Remaining: ${status.remaining}`);
```

---

### Validation Schemas

#### `InstanceNameSchema`
Zod schema for instance name validation.

**Usage:**
```typescript
import { InstanceNameSchema } from './validation.js';

const result = InstanceNameSchema.parse('production');
```

#### `BranchNameSchema`
Zod schema for branch name validation.

**Usage:**
```typescript
import { BranchNameSchema } from './validation.js';

const result = BranchNameSchema.parse('main');
```

#### `SchemaTypeNameSchema`
Zod schema for schema type name validation.

**Usage:**
```typescript
import { SchemaTypeNameSchema } from './validation.js';

const result = SchemaTypeNameSchema.parse('User');
```

---

## Error Handling

### Error Classes

All errors extend `MCPError` base class and can be converted to MCP responses.

#### `MCPError` (Abstract Base Class)

**Properties:**
- `code: string` - Error code
- `statusCode: number` - HTTP status code
- `message: string` - Error message
- `context?: Record<string, unknown>` - Additional context
- `cause?: Error` - Original error

**Methods:**
- `toMCPResponse(): { content: Array<{ type: "text"; text: string }> }` - Converts to MCP response format

---

#### `DatabaseError`

Database connection or query errors.

**Code:** `DATABASE_ERROR`  
**Status Code:** `500`

**Example:**
```typescript
import { DatabaseError } from './errors.js';

throw new DatabaseError('Connection failed', { instance: 'production' });
```

---

#### `ValidationError`

Input validation errors.

**Code:** `VALIDATION_ERROR`  
**Status Code:** `400`

**Properties:**
- `field?: string` - Field that failed validation
- `value?: unknown` - Invalid value

**Example:**
```typescript
import { ValidationError } from './errors.js';

throw new ValidationError('Invalid instance name', 'instance', 'invalid-name');
```

---

#### `AuthenticationError`

Authentication/authorization errors.

**Code:** `AUTHENTICATION_ERROR`  
**Status Code:** `401`

**Example:**
```typescript
import { AuthenticationError } from './errors.js';

throw new AuthenticationError('Invalid credentials');
```

---

#### `RateLimitError`

Rate limiting errors.

**Code:** `RATE_LIMIT_ERROR`  
**Status Code:** `429`

**Properties:**
- `retryAfter?: number` - Seconds until retry allowed

**Example:**
```typescript
import { RateLimitError } from './errors.js';

throw new RateLimitError('Too many requests', 60);
```

---

#### `ConfigurationError`

Configuration errors.

**Code:** `CONFIGURATION_ERROR`  
**Status Code:** `500`

**Example:**
```typescript
import { ConfigurationError } from './errors.js';

throw new ConfigurationError('Invalid config file');
```

---

#### `SecurityError`

Security-related errors.

**Code:** `SECURITY_ERROR`  
**Status Code:** `403`

**Example:**
```typescript
import { SecurityError } from './errors.js';

throw new SecurityError('Blocked code pattern detected');
```

---

#### `TimeoutError`

Timeout errors.

**Code:** `TIMEOUT_ERROR`  
**Status Code:** `408`

**Properties:**
- `timeoutMs?: number` - Timeout duration in milliseconds

**Example:**
```typescript
import { TimeoutError } from './errors.js';

throw new TimeoutError('Query timeout', 30000);
```

---

#### `NotFoundError`

Resource not found errors.

**Code:** `NOT_FOUND_ERROR`  
**Status Code:** `404`

**Example:**
```typescript
import { NotFoundError } from './errors.js';

throw new NotFoundError('Instance', 'production');
```

---

#### `ExternalServiceError`

External service errors.

**Code:** `EXTERNAL_SERVICE_ERROR`  
**Status Code:** `502`

**Example:**
```typescript
import { ExternalServiceError } from './errors.js';

throw new ExternalServiceError('gel CLI', 'Command failed');
```

---

#### `InternalServerError`

Internal server errors.

**Code:** `INTERNAL_SERVER_ERROR`  
**Status Code:** `500`

**Example:**
```typescript
import { InternalServerError } from './errors.js';

throw new InternalServerError('Unexpected error occurred');
```

---

### Error Utilities

#### `handleError(error: unknown, defaultMessage?: string): MCPError`

Converts any error to a standardized MCPError.

**Parameters:**
- `error: unknown` - Error to handle
- `defaultMessage: string` - Default message if error is not an Error instance

**Returns:** `MCPError` - Standardized error

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

**Behavior:**
- Returns MCPError as-is if already an MCPError
- Categorizes standard Errors based on message
- Creates InternalServerError for unknown errors

---

#### `wrapToolFunction(fn, defaultErrorMessage?)`

Wraps an async tool function with error handling.

**Parameters:**
- `fn: (...args: T) => Promise<R>` - Async function to wrap
- `defaultErrorMessage?: string` - Default error message

**Returns:** Wrapped function that returns MCP response on error

**Example:**
```typescript
import { wrapToolFunction } from './errors.js';

const safeTool = wrapToolFunction(async (args) => {
  // Tool implementation
  return result;
});

// Use in tool registration
server.registerTool('my-tool', schema, safeTool);
```

---

#### `createSuccessResponse(message: string, data?: unknown)`

Creates a success response.

**Parameters:**
- `message: string` - Success message
- `data?: unknown` - Optional data

**Returns:** MCP response format

**Example:**
```typescript
import { createSuccessResponse } from './errors.js';

return createSuccessResponse('Operation completed', { result: 'data' });
```

---

#### `createWarningResponse(message: string, details?: string)`

Creates a warning response.

**Parameters:**
- `message: string` - Warning message
- `details?: string` - Optional details

**Returns:** MCP response format

**Example:**
```typescript
import { createWarningResponse } from './errors.js';

return createWarningResponse('No instances found', 'Create instance_credentials directory');
```

---

#### `createInfoResponse(message: string, data?: unknown)`

Creates an info response.

**Parameters:**
- `message: string` - Info message
- `data?: unknown` - Optional data

**Returns:** MCP response format

**Example:**
```typescript
import { createInfoResponse } from './errors.js';

return createInfoResponse('Current connection', { instance: 'production' });
```

---

## Configuration APIs

### `loadConfig(): Config`

Loads configuration from file and environment variables.

**Returns:** `Config` - Configuration object

**Example:**
```typescript
import { loadConfig } from './config.js';

const config = loadConfig();
console.log(config.server.port); // 3000
```

**Behavior:**
- Loads from `gel-mcp-config.json` if exists
- Merges with environment variables
- Validates using Zod schema
- Caches result
- Falls back to defaults on error

---

### `getConfig(): Config`

Gets current configuration (loads if not cached).

**Returns:** `Config` - Configuration object

**Example:**
```typescript
import { getConfig } from './config.js';

const config = getConfig();
```

---

### `reloadConfig(): Config`

Reloads configuration from file.

**Returns:** `Config` - Configuration object

**Example:**
```typescript
import { reloadConfig } from './config.js';

const config = reloadConfig();
```

---

### `createSampleConfig(): void`

Creates a sample configuration file.

**Example:**
```typescript
import { createSampleConfig } from './config.js';

createSampleConfig();
// Creates gel-mcp-config.json.example
```

---

### Configuration Schema

```typescript
interface Config {
  server: {
    port: number; // default: 3000
    host: string; // default: "localhost"
    timeout: number; // default: 30000
  };
  database: {
    defaultInstance?: string;
    defaultBranch: string; // default: "main"
    connectionTimeout: number; // default: 10000
    queryTimeout: number; // default: 30000
  };
  schemaWatcher: {
    enabled: boolean; // default: true
    maxRetries: number; // default: 3
    retryDelay: number; // default: 5000
    watchTimeout: number; // default: 60000
  };
  security: {
    executeTypescript: {
      enabled: boolean; // default: true
      timeout: number; // default: 30000
      memoryLimit: number; // default: 128 (MB)
      maxCodeLength: number; // default: 10000
      allowedModules: string[]; // default: []
      blockedPatterns: string[]; // default: [regex patterns]
    };
    rateLimit: {
      enabled: boolean; // default: true
      windowMs: number; // default: 60000
      maxRequests: number; // default: 100
      executeToolsLimit: number; // default: 10
    };
  };
  logging: {
    level: "error" | "warn" | "info" | "debug"; // default: "info"
    maxFiles: number; // default: 5
    maxSize: number; // default: 5242880 (5MB)
    enableConsole: boolean; // default: true
  };
  tools: {
    validation: {
      strictMode: boolean; // default: true
      maxQueryLength: number; // default: 50000
      allowedSchemaPatterns: string[]; // default: ["^[a-zA-Z_][a-zA-Z0-9_]*$"]
    };
  };
}
```

### Environment Variables

Configuration can be overridden via environment variables:

- `GEL_MCP_PORT` - Server port
- `GEL_MCP_HOST` - Server host
- `GEL_MCP_TIMEOUT` - Server timeout
- `GEL_DEFAULT_INSTANCE` - Default instance
- `GEL_DEFAULT_BRANCH` - Default branch
- `GEL_CONNECTION_TIMEOUT` - Connection timeout
- `GEL_QUERY_TIMEOUT` - Query timeout
- `GEL_SCHEMA_WATCHER_ENABLED` - Enable schema watcher (true/false)
- `GEL_EXECUTE_TYPESCRIPT_ENABLED` - Enable TypeScript execution (true/false)
- `GEL_EXECUTE_TYPESCRIPT_TIMEOUT` - TypeScript execution timeout
- `GEL_EXECUTE_TYPESCRIPT_MEMORY_LIMIT` - Memory limit (MB)
- `GEL_RATE_LIMIT_ENABLED` - Enable rate limiting (true/false)
- `GEL_RATE_LIMIT_MAX_REQUESTS` - Max requests per window
- `GEL_RATE_LIMIT_EXECUTE_TOOLS` - Max execute tool requests per window
- `LOG_LEVEL` - Logging level (error/warn/info/debug)
- `GEL_LOG_CONSOLE` - Enable console logging (true/false)
- `GEL_PROJECT_ROOT` - Override project root path

---

## Session Management

### `setDefaultConnection(instance?: string, branch?: string): void`

Sets the default database instance and/or branch for the session.

**Parameters:**
- `instance?: string` - Instance name
- `branch?: string` - Branch name

**Example:**
```typescript
import { setDefaultConnection } from './session.js';

setDefaultConnection('production', 'main');
```

**Behavior:**
- Updates session state
- Only updates provided parameters
- Persists for session lifetime

---

### `getDefaultConnection(): SessionState`

Gets the current default connection settings.

**Returns:**
```typescript
{
  defaultInstance?: string;
  defaultBranch?: string;
}
```

**Example:**
```typescript
import { getDefaultConnection } from './session.js';

const connection = getDefaultConnection();
console.log(connection.defaultInstance); // 'production'
```

---

## Event System

### `emitConnectionChanged(payload: ConnectionChangedPayload): void`

Emits a connection changed event.

**Parameters:**
```typescript
{
  instance?: string;
  branch?: string;
}
```

**Example:**
```typescript
import { emitConnectionChanged } from './events.js';

emitConnectionChanged({ instance: 'production', branch: 'main' });
```

---

### `onConnectionChanged(listener: (payload: ConnectionChangedPayload) => void): void`

Subscribes to connection changed events.

**Parameters:**
- `listener: (payload: ConnectionChangedPayload) => void` - Event listener

**Example:**
```typescript
import { onConnectionChanged } from './events.js';

onConnectionChanged(({ instance, branch }) => {
  console.log(`Connection changed: ${instance}/${branch}`);
});
```

---

### `offConnectionChanged(listener: (payload: ConnectionChangedPayload) => void): void`

Unsubscribes from connection changed events.

**Parameters:**
- `listener: (payload: ConnectionChangedPayload) => void` - Event listener to remove

**Example:**
```typescript
import { offConnectionChanged } from './events.js';

offConnectionChanged(listener);
```

---

## HTTP Server APIs

### `startHttpServer(): Promise<void>`

Starts the HTTP server for MCP over HTTP transport.

**Example:**
```typescript
import { startHttpServer } from './http.js';

await startHttpServer();
```

**Behavior:**
- Starts Fastify server on configured port
- Sets up MCP transport with DNS rebinding protection
- Registers health check endpoint
- Initializes database client
- Handles graceful shutdown

---

### `registerHttpRoutes(fastify: FastifyInstance): void`

Registers HTTP routes for the server.

**Parameters:**
- `fastify: FastifyInstance` - Fastify instance

**Routes:**
- `GET /health` - Health check endpoint

**Example:**
```typescript
import fastify from 'fastify';
import { registerHttpRoutes } from './http.js';

const server = fastify();
registerHttpRoutes(server);
```

**Health Check Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "connection": {
    "defaultInstance": "production",
    "defaultBranch": "main"
  },
  "schemaWatcher": {
    "enabled": true,
    "status": "running"
  }
}
```

---

## Logging APIs

### `createLogger(context: string)`

Creates a logger instance for a specific context.

**Parameters:**
- `context: string` - Logger context name

**Returns:**
```typescript
{
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  log: (level: string, message: string, meta?: Record<string, unknown>) => void;
}
```

**Example:**
```typescript
import { createLogger } from './logger.js';

const logger = createLogger('database');
logger.info('Connection established', { instance: 'production' });
```

**Behavior:**
- Logs to files: `logs/error.log`, `logs/combined.log`
- Console output in development
- JSON format for files
- Colored console format
- Automatic log rotation

**Log Levels:**
- `error` - Error messages
- `warn` - Warning messages
- `info` - Informational messages
- `debug` - Debug messages

---

## Cache APIs

### `getCached<T>(key: string): T | undefined`

Gets a cached value.

**Parameters:**
- `key: string` - Cache key

**Returns:** Cached value or undefined

**Example:**
```typescript
import { getCached } from './cache.js';

const schema = getCached<string>('schema:get-schema:production:main');
```

---

### `setCached<T>(key: string, value: T, ttlMs: number): void`

Sets a cached value with TTL.

**Parameters:**
- `key: string` - Cache key
- `value: T` - Value to cache
- `ttlMs: number` - Time to live in milliseconds

**Example:**
```typescript
import { setCached } from './cache.js';

setCached('schema:get-schema:production:main', schemaData, 60000);
```

---

### `deleteByPrefix(prefix: string): void`

Deletes all cache entries with a given prefix.

**Parameters:**
- `prefix: string` - Key prefix

**Example:**
```typescript
import { deleteByPrefix } from './cache.js';

deleteByPrefix('schema:get-schema:production:');
```

---

### `buildSchemaCacheKey(kind: "get-schema" | "list-schema-types", instance: string, branch?: string): string`

Builds a cache key for schema operations.

**Parameters:**
- `kind: "get-schema" | "list-schema-types"` - Schema operation kind
- `instance: string` - Instance name
- `branch?: string` - Branch name

**Returns:** `string` - Cache key

**Example:**
```typescript
import { buildSchemaCacheKey } from './cache.js';

const key = buildSchemaCacheKey('get-schema', 'production', 'main');
// "schema:get-schema:production:main"
```

**Behavior:**
- Cache automatically invalidates on connection changes
- TTL-based expiration
- In-memory storage

---

## Usage Examples

### Complete Workflow Example

```typescript
// 1. Set up connection
import { setDefaultConnection } from './session.js';
setDefaultConnection('production', 'main');

// 2. Get client
import { getClientWithDefaults } from './utils.js';
const { client } = getClientWithDefaults({});

// 3. Explore schema
import { buildToolResponse } from './utils.js';
const schemaResult = await client.query(`
  SELECT schema::ObjectType {
    name,
    properties: { name, target: { name } }
  }
  FILTER NOT .name LIKE 'schema::%'
`);

// 4. Execute query
const users = await client.query('SELECT User { id, email } LIMIT 10');

// 5. Handle errors
import { handleError } from './errors.js';
try {
  // Operation
} catch (error) {
  const mcpError = handleError(error);
  return mcpError.toMCPResponse();
}
```

### MCP Tool Implementation Example

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wrapToolFunction, buildToolResponse } from "../utils.js";
import { checkRateLimit, validateConnectionArgs } from "../validation.js";
import { getClientWithDefaults } from "../utils.js";

export function registerMyTool(server: McpServer) {
  server.registerTool(
    "my-tool",
    {
      title: "My Tool",
      description: "Does something useful",
      inputSchema: {
        param1: z.string(),
        instance: z.string().optional(),
        branch: z.string().optional(),
      },
    },
    wrapToolFunction(async (args) => {
      checkRateLimit("my-tool");
      validateConnectionArgs(args);
      
      const { client, instance } = getClientWithDefaults(args);
      if (!client) {
        return buildToolResponse({
          status: "error",
          title: "Database client not available",
        });
      }

      // Tool implementation
      const result = await client.query("SELECT ...");

      return buildToolResponse({
        status: "success",
        title: "Operation completed",
        jsonData: result,
      });
    })
  );
}
```

---

## Best Practices

1. **Always validate inputs** using validation functions
2. **Use rate limiting** for execute operations
3. **Handle errors** with proper error classes
4. **Use connection defaults** via `getClientWithDefaults`
5. **Cache schema operations** when appropriate
6. **Log operations** with context
7. **Use transactions** for validation
8. **Sanitize user inputs** before database operations
9. **Follow MCP response format** for tool responses
10. **Document tool parameters** with Zod schemas

---

## Type Definitions

### Tool Response Types

```typescript
type ToolResponseSuccess = {
  type: "success";
  message: string;
  data?: unknown;
};

type ToolResponseWarn = {
  type: "warn";
  message: string;
  data?: unknown;
};

type ToolResponseError = {
  type: "error";
  message: string;
  data?: unknown;
};

type ToolResponseInfo = {
  type: "info";
  message: string;
  data?: unknown;
};

type ToolResponse =
  | ToolResponseSuccess
  | ToolResponseWarn
  | ToolResponseError
  | ToolResponseInfo;
```

### Session State Types

```typescript
interface SessionState {
  defaultInstance?: string;
  defaultBranch?: string;
}

interface SessionOptions {
  instance?: string;
  branch?: string;
}
```

### Connection Status Types

```typescript
interface ConnectionStatus {
  instance: string | undefined;
  branch: string | undefined;
  autoSelected: boolean;
}
```

---

## Additional Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Gel (EdgeDB) Documentation](https://docs.edgedb.com/)
- [EdgeQL Query Builder](https://docs.edgedb.com/libraries/js/querybuilder)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Zod Documentation](https://zod.dev/)

---

## Changelog

### Version 1.2.0
- Consolidated tools (connection, schema, query, docs)
- Enhanced error handling
- Improved validation
- Rate limiting
- Configuration system
- Event system
- HTTP server support
- Comprehensive logging

---

**Last Updated:** 2024-01-01  
**Documentation Version:** 1.0.0
