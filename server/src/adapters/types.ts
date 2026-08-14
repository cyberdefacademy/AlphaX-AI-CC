import type { RunOptions, RunResult } from '../runner';

export interface AgentRecord {
  id: string;
  type: string;
  name: string;
  detected: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface AgentInstance {
  id: string;
  name: string;
  model?: string;
  workspace?: string;
}

export interface AgentStatus {
  installed: boolean;
  binary?: string;
  version?: string;
  running: boolean;
  healthy?: boolean;
  service?: string;
  model?: string;
  provider?: string;
  auth?: { loggedIn?: boolean; hint?: string };
  detail?: Record<string, unknown>;
}

export interface SessionInfo {
  id: string;
  source?: string;
  title?: string;
  updated?: string;
}

export interface ChannelInfo {
  name: string;
  status?: string;
}

export interface ModelInfo {
  id: string;
  provider?: string;
  local?: boolean;
  context?: string;
}

export interface CronInfo {
  id: string;
  name: string;
  schedule: string;
  nextRun?: string;
  lastRun?: string;
  lastStatus?: string;
  class?: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPct: number;
  memMB: number;
}

export interface ConfigEntry {
  key: string;
  value: string;
}

export interface TaskOptions {
  instance?: string;
  prompt: string;
  timeout?: number;
}

export interface TaskResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface LogSource {
  name: string;
  lines: string[];
  path?: string;
}

export interface AgentAdapter {
  type: string;
  displayName: string;
  description: string;
  hasGateway: boolean;
  installCatalog?: { install: string; uninstall: string; note?: string };
  detect(): Promise<{ found: boolean; version?: string; binary?: string }>;
  getStatus(agent: AgentRecord): Promise<AgentStatus>;
  listAgents(agent: AgentRecord): Promise<AgentInstance[]>;
  sendMessage(
    agent: AgentRecord,
    opts: TaskOptions,
    onLine?: (line: string, isErr: boolean) => void
  ): Promise<TaskResult>;
  startGateway(agent: AgentRecord): Promise<RunResult>;
  stopGateway(agent: AgentRecord): Promise<RunResult>;
  restartGateway(agent: AgentRecord): Promise<RunResult>;
  listSessions(agent: AgentRecord): Promise<SessionInfo[]>;
  listChannels(agent: AgentRecord): Promise<ChannelInfo[]>;
  listModels(agent: AgentRecord): Promise<ModelInfo[]>;
  listCron(agent: AgentRecord): Promise<CronInfo[]>;
  getConfig(agent: AgentRecord): Promise<ConfigEntry[]>;
  setConfig?(agent: AgentRecord, key: string, value: string): Promise<RunResult>;
  getLogs(agent: AgentRecord): Promise<LogSource[]>;
  getProcesses(agent: AgentRecord): Promise<ProcessInfo[]>;
  runCommand(agent: AgentRecord, args: string[], opts?: RunOptions): Promise<RunResult>;
  runCron?(agent: AgentRecord, cronId: string): Promise<RunResult>;
  enableCron?(agent: AgentRecord, cronId: string): Promise<RunResult>;
  disableCron?(agent: AgentRecord, cronId: string): Promise<RunResult>;
}