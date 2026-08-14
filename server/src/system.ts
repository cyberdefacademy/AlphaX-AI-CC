import { getDb } from './db';
import { upsertByTypeName } from './registry';
import type { AgentRecord } from './adapters';
import type { DetectCandidate } from './detector';
import { presetFor } from './installers';

export function syncDetected(candidates: DetectCandidate[]): AgentRecord[] {
  const added: AgentRecord[] = [];
  for (const c of candidates) {
    const existing = getDb()
      .prepare('SELECT id FROM agents WHERE type = ? AND name = ?')
      .get(c.type, c.name) as unknown as { id: string } | undefined;
    if (existing) {
      if (c.type === 'generic' && c.preset) {
        const cur = getDb()
          .prepare('SELECT config FROM agents WHERE id = ?')
          .get(existing.id) as unknown as { config: string };
        let cfg: Record<string, unknown> = {};
        try {
          cfg = JSON.parse(cur.config);
        } catch {
          cfg = {};
        }
        if (!cfg.binary) {
          const rec = upsertByTypeName(c.type, c.name, {
            detected: true,
            config: {
              binary: c.binary,
              versionArgs: JSON.stringify(presetDefaults(c.preset) as never),
              installCommand: c.install,
            },
          });
          added.push(rec);
        }
      }
      continue;
    }
    let cfg: Record<string, unknown> = {};
    if (c.type === 'generic' && c.preset) {
      cfg = buildGenericConfig(c.preset, c.binary, c.install);
    }
    const rec = upsertByTypeName(c.type, c.name, { detected: true, config: cfg });
    added.push(rec);
  }
  return added;
}

function presetDefaults(slug: string): string[] {
  const p = presetFor(slug);
  return p ? p.versionArgs : ['--version'];
}

export function buildGenericConfig(
  slug: string,
  binary?: string,
  installCommand?: string
): Record<string, unknown> {
  const p = presetFor(slug);
  if (!p) return { binary: binary || slug, installCommand };
  const cfg: Record<string, unknown> = {
    binary: binary || slug,
    versionArgs: JSON.stringify(p.versionArgs),
    sendArgs: JSON.stringify(p.sendArgs),
    notes: p.notes,
  };
  if (p.listArgs) cfg.listArgs = JSON.stringify(p.listArgs);
  if (installCommand || p.install) cfg.installCommand = installCommand || p.install;
  return cfg;
}

export function genericConfigFor(slug: string, binary?: string): Record<string, unknown> {
  return buildGenericConfig(slug, binary);
}