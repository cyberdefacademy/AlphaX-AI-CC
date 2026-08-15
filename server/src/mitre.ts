import { getDb, nowIso } from './db';
import { audit } from './security';

export interface Technique { id: string; name: string; tactic: string; description: string; }
export interface TechniqueCandidate { id: string; confidence: number; reason: string; }

const seed: Technique[] = [
  { id: 'T1046', name: 'Network Service Scanning', tactic: 'Discovery', description: 'Scanning systems for network services.' },
  { id: 'T1087', name: 'Account Discovery', tactic: 'Discovery', description: 'Discovering accounts on a system or environment.' },
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution', description: 'Using command or scripting interpreters.' },
  { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access', description: 'Exploiting a public-facing application.' },
  { id: 'T1552', name: 'Unsecured Credentials', tactic: 'Credential Access', description: 'Searching for insecurely stored credentials.' },
  { id: 'T1005', name: 'Data from Local System', tactic: 'Collection', description: 'Collecting data from a local system.' },
];

export function initMitreSchema(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS mitre_techniques(id TEXT PRIMARY KEY,name TEXT NOT NULL,tactic TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS finding_techniques(finding_id TEXT NOT NULL,technique_id TEXT NOT NULL,confidence REAL NOT NULL DEFAULT 1,PRIMARY KEY(finding_id,technique_id));`);
  const insert = db.prepare('INSERT OR IGNORE INTO mitre_techniques(id,name,tactic,description,created_at) VALUES (?,?,?,?,?)');
  for (const x of seed) insert.run(x.id, x.name, x.tactic, x.description, nowIso());
}

export function listTechniques(): Technique[] { return getDb().prepare('SELECT id,name,tactic,description FROM mitre_techniques ORDER BY tactic,name').all() as unknown as Technique[]; }

export function mapFinding(findingId: string, techniqueId: string, confidence = 1, actor = 'system'): void {
  if (!getDb().prepare('SELECT id FROM mitre_techniques WHERE id=?').get(techniqueId)) throw new Error('technique not found');
  const score = Math.max(0, Math.min(1, confidence));
  getDb().prepare('INSERT OR REPLACE INTO finding_techniques(finding_id,technique_id,confidence) VALUES (?,?,?)').run(findingId, techniqueId, score);
  audit(actor, 'mitre.finding.mapped', findingId, 'allow', { techniqueId, confidence: score });
}

export function techniquesForFinding(findingId: string): unknown[] {
  return getDb().prepare('SELECT t.*,ft.confidence FROM mitre_techniques t JOIN finding_techniques ft ON ft.technique_id=t.id WHERE ft.finding_id=?').all(findingId);
}

export function candidateTechniques(input: { provider?: string; tool?: string; text: string }): TechniqueCandidate[] {
  const corpus = `${input.provider ?? ''} ${input.tool ?? ''} ${input.text ?? ''}`.toLowerCase();
  const rules: Array<{ id: string; score: number; terms: string[]; reason: string }> = [
    { id: 'T1046', score: 0.84, terms: ['nmap', 'port scan', 'port scanning', 'service scan', 'network service', 'open ports'], reason: 'network/service enumeration indicators' },
    { id: 'T1087', score: 0.82, terms: ['account discovery', 'user discovery', 'list users', 'enumerate users', 'domain users', 'passwd'], reason: 'account enumeration indicators' },
    { id: 'T1059', score: 0.78, terms: ['command', 'shell', 'bash', 'zsh', 'powershell', 'cmd.exe', 'python', 'script'], reason: 'command or scripting interpreter indicators' },
    { id: 'T1190', score: 0.86, terms: ['public-facing', 'internet-facing', 'web exploit', 'application exploit', 'remote code execution', 'rce'], reason: 'public-facing application exploitation indicators' },
    { id: 'T1552', score: 0.88, terms: ['credential', 'password', 'secret', 'private key', 'shadow', 'bash_history', 'api key'], reason: 'potential unsecured credential access indicators' },
    { id: 'T1005', score: 0.76, terms: ['local file', 'collect file', 'sensitive file', 'data from local', 'documents', 'configuration file'], reason: 'local data collection indicators' },
  ];
  const out: TechniqueCandidate[] = [];
  for (const rule of rules) if (rule.terms.some((term) => corpus.includes(term))) out.push({ id: rule.id, confidence: rule.score, reason: rule.reason });
  return out;
}
