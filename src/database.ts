import { createClient } from 'gel';

export interface ConnectionOptions {
  database: string;
  host: string;
  port: number;
  user: string;
  password: string;
  tlsSecurity?: string;
}

const baseConfig = {
  host: process.env.GEL_DB_HOST || 'localhost',
  port: parseInt(process.env.GEL_DB_PORT || '10700', 10),
  user: process.env.GEL_DB_USER || 'edgedb',
  password: process.env.GEL_DB_PASSWORD || 'password',
  tlsSecurity: process.env.GEL_DB_TLS || 'insecure',
};

const clientRegistry: Record<string, any> = {};
let defaultClient: any;

export async function getBranchClient(branch: string): Promise<any> {
  if (!clientRegistry[branch]) {
    clientRegistry[branch] = createClient({ ...baseConfig, database: branch });
  }
  return clientRegistry[branch];
}

export async function initGelClient(): Promise<boolean> {
  try {
    const branch = process.env.GEL_BRANCH_ID || 'default';
    defaultClient = await getBranchClient(branch);
    await defaultClient.query('SELECT "Gel MCP Server connection test"');
    console.error('Gel database connection successful');
    return true;
  } catch (err) {
    console.error('Error connecting to Gel database:', err);
    return false;
  }
}

export function getGelClient() {
  return defaultClient;
}
