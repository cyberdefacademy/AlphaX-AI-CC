export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = (j as { error?: string }).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const apiGet = <T>(p: string) => api<T>(p);
export const apiPost = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T>(p: string, body?: unknown) =>
  api<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T>(p: string) => api<T>(p, { method: 'DELETE' });

export function connectWs(onEvent: (topic: string, data: unknown) => void): { close: () => void } {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempts = 0;

  const connect = () => {
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      attempts = 0;
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        onEvent(m.topic, m.data);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      attempts += 1;
      setTimeout(connect, Math.min(1000 * attempts, 8000));
    };
    ws.onerror = () => ws?.close();
  };
  connect();

  return {
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}