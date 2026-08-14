export interface Installer {
  install: string;
  uninstall: string;
  note: string;
}

export const INSTALLERS: Record<string, Installer> = {
  openclaw: {
    install: 'npm install -g openclaw@latest',
    uninstall: 'npm uninstall -g openclaw',
    note: 'Installs via npm (Node.js required).',
  },
  hermes: {
    install:
      'git clone https://github.com/NousResearch/hermes-agent ~/.hermes/hermes-agent && cd ~/.hermes/hermes-agent && python3 -m venv venv && ./venv/bin/pip install --upgrade pip && ./venv/bin/pip install -r requirements.txt',
    uninstall: 'rm -rf ~/.hermes/hermes-agent',
    note: 'Clones the official Hermes Agent repo and creates a Python venv (same layout as the existing ~/.hermes install).',
  },
  claude: {
    install: 'curl -fsSL https://claude.ai/install.sh | bash',
    uninstall: 'rm -f ~/.local/bin/claude',
    note: 'Official Claude Code installer. Requires an Anthropic login/token.',
  },
  opencode: {
    install: 'curl -fsSL https://opencode.ai/install | bash',
    uninstall: 'rm -f ~/.opencode/bin/opencode',
    note: 'Official opencode installer.',
  },
};

export function installerFor(type: string): Installer | null {
  return INSTALLERS[type] || null;
}

export interface GenericPreset {
  name: string;
  install?: string;
  versionArgs: string[];
  sendArgs: string[];
  listArgs?: string[];
  notes?: string;
}

export const GENERIC_PRESETS: Record<string, GenericPreset> = {
  codex: {
    name: 'Codex (OpenAI)',
    install: 'npm install -g @openai/codex',
    versionArgs: ['--version'],
    sendArgs: ['exec', '{{message}}'],
    notes: 'OpenAI Codex CLI.',
  },
  aider: {
    name: 'Aider',
    install: 'curl -LsSf https://aider.chat/install.sh | sh',
    versionArgs: ['--version'],
    sendArgs: ['--message', '{{message}}', '--yes-always', '--no-auto-commits', '--no-suggest-shell-commands'],
    notes: 'AI pair programming in your terminal.',
  },
  ollama: {
    name: 'Ollama',
    install: 'curl -fsSL https://ollama.com/install.sh | sh',
    versionArgs: ['--version'],
    sendArgs: ['run', '{{instance}}', '{{message}}'],
    listArgs: ['list'],
    notes: 'Local model runner. Each installed model becomes an instance.',
  },
  goose: {
    name: 'Goose',
    install: 'curl -fsSL https://github.com/block/goose/releases/latest/download/install.sh | bash',
    versionArgs: ['--version'],
    sendArgs: ['run', '-t', '{{message}}'],
    notes: 'Block\u2019s open-source on-device AI agent.',
  },
  gemini: {
    name: 'Gemini CLI',
    install: 'curl -fsSL https://raw.githubusercontent.com/google-gemini/gemini-cli/main/install.sh | bash',
    versionArgs: ['--version'],
    sendArgs: ['-p', '{{message}}'],
    notes: 'Google Gemini CLI.',
  },
};

export function presetFor(name: string): GenericPreset | null {
  return GENERIC_PRESETS[name] || null;
}