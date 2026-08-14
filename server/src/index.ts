import http from 'http';
import { createApp } from './app';
import { hub } from './ws';
import { defaultConfig, APP_NAME } from './config';
import { getDb } from './db';
import { generateToken, tokenConfigured } from './auth';
import { detectAll } from './detector';
import { syncDetected } from './system';
import { addActivity } from './db';
import { interruptStale } from './tasks';
import { sampleAndRecord } from './metrics';
import { enableFileLogging, info } from './logger';

const BANNER = `
  █████╗ ██╗     ██████╗ ██╗  ██╗ █████╗ ██╗  ██╗
 ██╔══██╗██║     ██╔══██╗██║  ██║██╔══██╗╚██╗██╔╝
 ███████║██║     ██████╔╝███████║███████║ ╚███╔╝
 ██╔══██║██║     ██╔═══╝ ██╔══██║██╔══██║ ██╔██╗
 ██║  ██║███████╗██║     ██║  ██║██║  ██║██╔╝ ██╗
 ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
`;

async function main() {
  const cfg = defaultConfig();
  getDb();
  enableFileLogging();
  const interrupted = interruptStale();

  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(BANNER);
    console.log(`  ${APP_NAME} — local control plane for your AI agents`);
    console.log('');
    console.log('  Usage:');
    console.log('    npm start                         run the dashboard');
    console.log('    npm start -- --rotate-token       rotate the access token and print the new one');
    console.log('                                      (keeps sessions, agents, activity)');
    console.log('');
    process.exit(0);
  }

  if (args.includes('--rotate-token')) {
    const raw = generateToken();
    console.log(BANNER);
    console.log(`  ${APP_NAME} access token rotated`);
    console.log('');
    console.log(`  New access token : ${raw}`);
    console.log('   (shown once - write it down. The previous token no longer works;');
    console.log('    active login sessions are unaffected and registrations are kept.)');
    console.log('');
    process.exit(0);
  }

  let token: string | null = null;
  if (!tokenConfigured()) {
    token = generateToken();
  }

  const app = createApp();
  const server = http.createServer(app);
  hub.attach(server);

  server.listen(cfg.port, cfg.host, async () => {
    console.log(BANNER);
    console.log(`  ${APP_NAME} is running`);
    console.log(`  Dashboard : http://${cfg.host}:${cfg.port}`);
    if (token) {
      console.log(`  Access token : ${token}`);
      console.log('   (shown once - write it down. Rotate anytime in Settings.)');
    } else {
      console.log('  Access token : already configured (login with your token)');
    }
    console.log(`  Auth        : session cookies, local-only bind`);
    if (interrupted) console.log(`  Tasks      : ${interrupted} left in a stale state marked interrupted`);
    console.log('');

    addActivity('system', 'Dashboard started' + (interrupted ? ` (${interrupted} stale tasks interrupted)` : ''));

    sampleAndRecord();
    setInterval(sampleAndRecord, 15000).unref();

    const runScan = async () => {
      try {
        const candidates = await detectAll();
        const added = syncDetected(candidates);
        if (added.length) {
          addActivity('system', `Auto-discovered: ${added.map((a) => a.name).join(', ')}`);
          console.log(`  [detect] new: ${added.map((a) => a.name).join(', ')}`);
        }
        hub.broadcast('detect:done', {
          count: candidates.length,
          names: candidates.map((c) => c.name),
        });
      } catch (e) {
        console.error('[detect] error:', (e as Error).message);
      }
    };

    await runScan();
    setInterval(runScan, cfg.detectIntervalSec * 1000);
  });

  const shutdown = () => {
    console.log('\n  Shutting down…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});