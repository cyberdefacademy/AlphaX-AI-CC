export type FailClass =
  | 'ok'
  | 'rate_limit'
  | 'auth_required'
  | 'gateway_down'
  | 'timeout'
  | 'not_found'
  | 'config_error'
  | 'unknown';

export interface Classification {
  class: FailClass;
  severity: 'none' | 'low' | 'medium' | 'high';
  label: string;
  fix?: string;
}

interface Input {
  status?: string;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  duration_ms?: number | null;
  timeout_ms?: number;
}

const RULES: Array<{ cls: FailClass; severity: 'low' | 'medium' | 'high'; label: string; fix: string; re: RegExp }> = [
  {
    cls: 'rate_limit',
    severity: 'medium',
    label: 'Rate limit',
    fix: 'The model provider is throttling requests. Wait a bit, reduce concurrency, or check your provider quota/key.',
    re: /rate limit|429|too many requests|quota|throttl/i,
  },
  {
    cls: 'auth_required',
    severity: 'high',
    label: 'Auth required',
    fix: 'The agent is not authenticated. Run its login flow once from a terminal (e.g. `claude` then /login).',
    re: /not logged in|please run \/login|authentication (required|failed)|unauthori[sz]ed|invalid api key|401|403/i,
  },
  {
    cls: 'gateway_down',
    severity: 'high',
    label: 'Gateway down',
    fix: 'The agent gateway is unreachable. Start or restart it from the Status tab.',
    re: /gateway.*(not (running|reachable|found)|down|unreachable)|econnrefused|socket hang up|no connection|connection refused|connect timeout/i,
  },
  {
    cls: 'timeout',
    severity: 'medium',
    label: 'Timeout',
    fix: 'The task exceeded its time budget. Increase the timeout or split the prompt into smaller steps.',
    re: /timed? ?out|timeout|exceeded.*(time|deadline)/i,
  },
  {
    cls: 'not_found',
    severity: 'medium',
    label: 'Target not found',
    fix: 'The selected agent instance / session / tool does not exist. Pick a valid instance from the agents list.',
    re: /no target session|not found|no such agent|does not exist|no agent (named|with)|invalid (agent|instance|session)/i,
  },
  {
    cls: 'config_error',
    severity: 'medium',
    label: 'Config error',
    fix: 'The agent configuration is invalid. Check the Config tab and its logs for the specific error.',
    re: /invalid config|configuration error|missing (api|config)|misconfigur|env var|environment variable/i,
  },
];

export function classifyResult(input: Input): Classification {
  if (input.status === 'done' || input.status === 'ok') {
    return { class: 'ok', severity: 'none', label: 'OK' };
  }

  const blob = `${input.stdout || ''}\n${input.stderr || ''}`.slice(0, 8000);
  for (const rule of RULES) {
    if (rule.re.test(blob)) {
      return { class: rule.cls, severity: rule.severity, label: rule.label, fix: rule.fix };
    }
  }

  if (input.timeout_ms && input.duration_ms && input.duration_ms >= input.timeout_ms - 500) {
    return {
      class: 'timeout',
      severity: 'medium',
      label: 'Timeout',
      fix: 'The task exceeded its time budget. Increase the timeout or split the prompt into smaller steps.',
    };
  }

  if (input.status === 'error' || (input.code && input.code !== 0)) {
    return { class: 'unknown', severity: 'low', label: 'Unknown error', fix: 'Review the task output for the underlying cause.' };
  }

  return { class: 'ok', severity: 'none', label: 'OK' };
}

export const FAIL_LABELS: Record<FailClass, string> = {
  ok: 'OK',
  rate_limit: 'Rate limit',
  auth_required: 'Auth required',
  gateway_down: 'Gateway down',
  timeout: 'Timeout',
  not_found: 'Target not found',
  config_error: 'Config error',
  unknown: 'Unknown',
};
