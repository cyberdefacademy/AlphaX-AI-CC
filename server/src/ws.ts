import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseCookies, validSession } from './auth';

export class Hub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => {
      const cookies = parseCookies(req.headers.cookie || '');
      if (!cookies.session || !validSession(cookies.session)) {
        ws.close(4001, 'unauthorized');
        return;
      }
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
    });
  }

  broadcast(topic: string, data: unknown): void {
    const msg = JSON.stringify({ topic, data });
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) {
        try {
          c.send(msg);
        } catch {
          this.clients.delete(c);
        }
      }
    }
  }

  clientsCount(): number {
    return this.clients.size;
  }
}

export const hub = new Hub();