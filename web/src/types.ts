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

export interface Agent {
  id: string;
  type: string;
  name: string;
  detected: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status: AgentStatus | null;
}

export interface SystemMetrics {
  load: number[];
  cpuCount: number;
  memTotalMB: number;
  memUsedMB: number;
  memUsedPct: number;
  uptimeSec: number;
  bootTime: number;
}

export interface SystemOverview {
  agents: Agent[];
  system: SystemMetrics;
}

export interface ActivityItem {
  id: string;
  ts: string;
  kind: string;
  agent_id: string | null;
  message: string;
  detail: Record<string, unknown> | null;
}

export interface TaskRecord {
  id: string;
  ts: string;
  agent_id: string;
  instance: string | null;
  prompt: string;
  status: 'running' | 'queued' | 'done' | 'error' | 'interrupted';
  class?: string | null;
  result: string | null;
  duration_ms: number | null;
}

export interface QueueState {
  running: number;
  queued: number;
  positions: Record<string, number>;
}

export interface MetricPoint {
  ts: number;
  load1: number;
  memPct: number;
  cpuPct: number;
  tasksRunning: number;
}

export interface MetricSeriesResponse {
  points: MetricPoint[];
}

export interface Recommendation {
  id: string;
  agentId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  action?: { kind: 'gateway' | 'ping' | 'settings'; value: string };
}

export interface MatrixRow {
  agentId: string;
  name: string;
  type: string;
  enabled: boolean;
  running: boolean;
  healthy?: boolean;
  version?: string;
  model?: string;
  auth?: { loggedIn?: boolean };
  lastTask: { status: string; class: string; ts: string } | null;
  taskFailures24h: number;
  taskTotal24h: number;
  cronFailures: number;
  cronTotal: number;
}

export interface FleetHealth {
  matrix: MatrixRow[];
  recommendations: Recommendation[];
  byClass: Record<string, number>;
  failingTaskPct24h: number;
}

export interface AgentInstance {
  id: string;
  name: string;
  model?: string;
  workspace?: string;
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

export interface LogSource {
  name: string;
  lines: string[];
  path?: string;
}

export interface DetectCandidate {
  type: string;
  name: string;
  version?: string;
  binary?: string;
  configDir?: string;
  service?: string;
  port?: number;
  foundBy: string[];
  installable: boolean;
  preset?: string;
  install?: string;
}

export interface PresetMeta {
  slug: string;
  name: string;
  install?: string;
  notes?: string;
}