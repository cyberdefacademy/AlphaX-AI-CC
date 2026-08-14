import os from 'os';
import path from 'path';

export const APP_NAME = 'AlphaX Agents OS';

export function dataDir(): string {
  return process.env.ALPHAX_HOME || path.join(os.homedir(), '.alphax-agents-os');
}

export interface ServerConfig {
  port: number;
  host: string;
  detectIntervalSec: number;
}

export function defaultConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT || 8455),
    host: process.env.HOST || '127.0.0.1',
    detectIntervalSec: Number(process.env.DETECT_INTERVAL || 60),
  };
}