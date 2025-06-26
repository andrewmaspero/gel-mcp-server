import { createClient, Client, ConnectOptions } from 'gel';
import path from 'path';
import fs from 'fs';
import { getDefaultConnection } from './session.js';

let defaultClient: Client | null = null;
const clientRegistry: Map<string, Client> = new Map();

/**
 * Find the project root directory by looking for package.json
 * This handles cases where the MCP server is running from a different working directory
 */
function findProjectRoot(): string {
  // Start from the current working directory and this file's directory
  const possibleRoots = [
    process.cwd(),
    __dirname,
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..')
  ];
  
  // Check each possible root for package.json
  for (const rootCandidate of possibleRoots) {
    const packageJsonPath = path.join(rootCandidate, 'package.json');
    const credentialsPath = path.join(rootCandidate, 'instance_credentials');
    
    if (fs.existsSync(packageJsonPath) && fs.existsSync(credentialsPath)) {
      return rootCandidate;
    }
  }
  
  // If not found, walk up from __dirname
  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  // Fallback to process.cwd() if package.json is not found
  console.warn('Could not find project root with package.json, falling back to process.cwd()');
  return process.cwd();
}

// Cache the project root to avoid repeated filesystem operations
let projectRoot: string | null = null;

function getProjectRoot(): string {
  if (!projectRoot) {
    projectRoot = findProjectRoot();
  }
  return projectRoot;
}

function getClientKey(instance?: string, branch?: string): string {
  const session = getDefaultConnection();
  const inst = instance || session.defaultInstance || 'afca_intelligence';
  const br = branch || session.defaultBranch || 'main';
  return `${inst}:${br}`;
}

/**
 * Check if a credential file exists for the given instance
 */
function credentialFileExists(instance: string): boolean {
  const credentialsFile = path.join(
    getProjectRoot(),
    'instance_credentials',
    `${instance}.json`
  );
  return fs.existsSync(credentialsFile);
}

/**
 * Get all available instances by scanning the instance_credentials directory
 */
export function getAvailableInstances(): string[] {
  try {
    const credentialsDir = path.join(getProjectRoot(), 'instance_credentials');
    if (!fs.existsSync(credentialsDir)) {
      return [];
    }
    
    const files = fs.readdirSync(credentialsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    return jsonFiles.map(file => path.basename(file, '.json'));
  } catch (error) {
    console.warn('Error scanning instance credentials:', error);
    return [];
  }
}

export function getDatabaseClient(options?: { instance?: string; branch?: string }): Client {
  const session = getDefaultConnection();
  const instance = options?.instance || session.defaultInstance || 'afca_intelligence';
  const branch = options?.branch || session.defaultBranch;
  const key = getClientKey(instance, branch);

  if (clientRegistry.has(key)) {
    return clientRegistry.get(key)!;
  }

  const connectOptions: ConnectOptions = {};
  let client: Client;

  if (instance && instance !== 'default') {
    // Check if credential file exists before trying to use it
    if (!credentialFileExists(instance)) {
      throw new Error(
        `Credential file not found for instance '${instance}'. ` +
        `Expected file: instance_credentials/${instance}.json. ` +
        `Available instances: ${getAvailableInstances().join(', ') || 'none'}. ` +
        `Project root: ${getProjectRoot()}`
      );
    }
    
    connectOptions.credentialsFile = path.join(
      getProjectRoot(),
      'instance_credentials',
      `${instance}.json`
    );
  }
  
  if (branch) {
    connectOptions.branch = branch;
  }

  if (Object.keys(connectOptions).length > 0) {
    client = createClient(connectOptions);
  } else {
    // Fallback to default project connection
    client = createClient();
  }

  clientRegistry.set(key, client);

  if (!defaultClient) {
    defaultClient = client;
  }

  return client;
}

export async function initGelClient(): Promise<boolean> {
  try {
    // Initialize the default client using the hardcoded default instance
    defaultClient = getDatabaseClient({ instance: 'afca_intelligence' });
    await defaultClient.query('SELECT "Gel MCP Server connection test"');
    console.log(`Gel database connection successful to instance: afca_intelligence`);
    return true;
  } catch (err) {
    console.error('Error connecting to Gel database:', err);
    defaultClient = null;
    return false;
  }
}

export function closeAllConnections(): Promise<void> {
  const promises = [];
  for (const client of clientRegistry.values()) {
    promises.push(client.close?.());
  }
  clientRegistry.clear();
  defaultClient = null;
  return Promise.all(promises).then(() => {});
}

export function getDebugInfo(): { projectRoot: string; cwd: string; dirname: string } {
  return {
    projectRoot: getProjectRoot(),
    cwd: process.cwd(),
    dirname: __dirname
  };
}

/**
 * Get the query builder for a specific instance
 * This provides type-safe access to the EdgeQL query builder for the instance
 */
export async function getInstanceQueryBuilder(instanceName?: string) {
  try {
    // Dynamically import the query builder index to avoid loading all instances
    const qbModule: any = await import('./edgeql-js/index.js');
    
    // Check if the module has the expected functions
    if (!qbModule.getQueryBuilder || !qbModule.getAvailableInstances) {
      throw new Error('Query builder module is not properly generated. Run "npm run generate-schemas".');
    }
    
    // If no instance specified, use the session default or first available
    const session = getDefaultConnection();
    const targetInstance = instanceName || session.defaultInstance;
    
    if (!targetInstance) {
      const available = qbModule.getAvailableInstances();
      if (available.length === 0) {
        throw new Error('No query builders available. Run "npm run generate-schemas" to generate them.');
      }
      // Use the first available instance as fallback
      return await qbModule.getQueryBuilder(available[0]);
    }
    
    return await qbModule.getQueryBuilder(targetInstance);
  } catch (error: any) {
    console.warn('Failed to load query builder:', error.message);
    throw new Error(`Query builder not available for instance "${instanceName}". Available instances: ${getAvailableInstances().join(', ')}`);
  }
}

/**
 * Get available query builder instances
 */
export function getAvailableQueryBuilders(): string[] {
  try {
    // Try to synchronously require the query builder index
    const qbModule: any = require('./edgeql-js/index.js');
    if (qbModule.getAvailableInstances && typeof qbModule.getAvailableInstances === 'function') {
      return qbModule.getAvailableInstances();
    }
  } catch (error) {
    // Fallback to scanning instance credentials if query builders aren't generated yet
  }
  return getAvailableInstances();
}
