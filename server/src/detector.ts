import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { run, which } from './runner';
import { adapterFor } from './adapters';
import { GENERIC_PRESETS, presetFor } from './installers';

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

interface TypeDef {
  binary: string;
  configDir?: string;
  service?: string;
  ports?: number[];
}

const DEFINITIONS: Record<string, TypeDef> = {
  openclaw: { binary: 'openclaw', configDir: '.openclaw', service: 'openclaw-gateway', ports: [18789] },
  hermes: { binary: 'hermes', configDir: '.hermes', service: 'hermes-gateway', ports: [9119] },
  claude: { binary: 'claude', configDir: '.claude' },
  opencode: { binary: 'opencode', configDir: '.config/opencode' },
};

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1', timeout: 1200 });
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function serviceActive(unit: string): Promise<boolean> {
  try {
    const r = await run('systemctl', ['--user', 'is-active', unit], { timeout: 6000 });
    return r.stdout.trim().toLowerCase() === 'active';
  } catch {
    return false;
  }
}

export async function detectAll(): Promise<DetectCandidate[]> {
  const out: DetectCandidate[] = [];
  const home = os.homedir();

  for (const [type, def] of Object.entries(DEFINITIONS)) {
    const foundBy: string[] = [];
    const bin = await which(def.binary);
    let version: string | undefined;
    if (bin) {
      foundBy.push('PATH');
      try {
        const a = adapterFor(type);
        if (a) version = (await a.detect()).version;
      } catch {
        /* ignore */
      }
    }
    if (def.configDir) {
      const dir = path.join(home, def.configDir);
      if (fs.existsSync(dir)) foundBy.push('config: ~/' + def.configDir);
    }
    if (def.service && (await serviceActive(def.service))) {
      foundBy.push('service: ' + def.service);
    }
    for (const p of def.ports || []) {
      if (await portOpen(p)) foundBy.push('port: ' + p);
    }
    if (foundBy.length) {
      const cand: DetectCandidate = {
        type,
        name: adapterFor(type)?.displayName ?? type,
        version,
        binary: bin || undefined,
        configDir: def.configDir,
        service: def.service,
        port: def.ports?.[0],
        foundBy,
        installable: true,
      };
      out.push(cand);
    }
  }

  for (const [slug, preset] of Object.entries(GENERIC_PRESETS)) {
    const bin = await which(slug);
    if (!bin) continue;
    let version: string | undefined;
    try {
      const r = await run(bin, preset.versionArgs, { timeout: 8000 });
      version = r.stdout.trim().split('\n')[0] || undefined;
    } catch {
      /* ignore */
    }
    out.push({
      type: 'generic',
      name: preset.name,
      version,
      binary: bin,
      foundBy: ['PATH'],
      installable: true,
      preset: slug,
      install: preset.install,
    });
  }

  return out;
}

export function presetsList(): { slug: string; preset: ReturnType<typeof presetFor> }[] {
  return Object.entries(GENERIC_PRESETS).map(([slug, p]) => ({ slug, preset: p }));
}