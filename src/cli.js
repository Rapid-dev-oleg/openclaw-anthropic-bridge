#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('./config');
const { start } = require('./server');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const HOME = process.env.HOME || '/root';
const CLAUDE_CREDS = path.join(HOME, '.claude', '.credentials.json');
const OPENCLAW_CONFIG = path.join(HOME, '.openclaw', 'openclaw.json');

const ANTHROPIC_MODELS = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    api: "anthropic-messages",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 16000
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    api: "anthropic-messages",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 16000
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    api: "anthropic-messages",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192
  }
];

// ─── Auto Setup ──────────────────────────────────────────────

async function autoSetup() {
  console.log('\n  🔧 openclaw-anthropic-bridge auto-setup\n');

  const cfg = config.load();
  let token = null;
  let errors = [];

  // Step 1: Find Claude Code token
  console.log('  [1/5] Looking for Claude Code credentials...');
  if (fs.existsSync(CLAUDE_CREDS)) {
    try {
      const creds = JSON.parse(fs.readFileSync(CLAUDE_CREDS, 'utf8'));
      token = creds?.claudeAiOauth?.accessToken;
      if (token) {
        console.log(`    ✓ Found token: ${token.substring(0, 20)}...`);
      } else {
        errors.push('Token not found in credentials');
        console.log('    ✗ No accessToken in credentials file');
      }
    } catch (e) {
      errors.push('Cannot parse credentials: ' + e.message);
      console.log('    ✗ Cannot parse credentials file');
    }
  } else {
    console.log('    ✗ ~/.claude/.credentials.json not found');
    console.log('    → Run "claude" CLI first to login');
    errors.push('No credentials file');
  }

  // Step 2: Ask for proxy (optional)
  console.log('\n  [2/5] External proxy configuration...');
  console.log('    Needed if Anthropic is geo-blocked in your region');
  const proxy = await ask('    Proxy (http://user:pass@host:port or empty): ');
  if (proxy && proxy.trim()) {
    cfg.proxy = proxy.trim();
    console.log(`    ✓ Proxy: ${cfg.proxy.replace(/:\/\/.*@/, '://***@')}`);
  } else {
    cfg.proxy = null;
    console.log('    → Direct connection (no proxy)');
  }

  // Step 3: Test connection
  console.log('\n  [3/5] Testing API connection...');
  if (token) {
    try {
      const undici = require('undici');
      const fetchOpts = {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${token}`,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
          'user-agent': 'claude-cli/2.1.92 (external, cli)',
          'x-app': 'cli',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      };
      if (cfg.proxy) {
        const proxyUrl = new URL(cfg.proxy);
        fetchOpts.dispatcher = new undici.ProxyAgent({
          uri: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
          ...(proxyUrl.username ? {
            token: 'Basic ' + Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString('base64')
          } : {})
        });
      }
      const resp = await undici.fetch('https://api.anthropic.com/v1/messages?beta=true', fetchOpts);
      if (resp.status === 200) {
        console.log('    ✓ API connection OK (haiku responded)');
      } else if (resp.status === 429) {
        console.log('    ✓ API connection OK (rate limited, but auth works)');
      } else if (resp.status === 403) {
        const body = await resp.text();
        if (body.includes('Request not allowed') && !cfg.proxy) {
          console.log('    ✗ 403 Forbidden — likely geo-blocked');
          console.log('    → You need an external proxy. Re-run with proxy.');
          errors.push('Geo-blocked, need proxy');
        } else {
          console.log(`    ✗ API returned ${resp.status}`);
          errors.push(`API error: ${resp.status}`);
        }
      } else {
        const body = await resp.text();
        console.log(`    ⚠ API returned ${resp.status}: ${body.substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`    ✗ Connection failed: ${e.message}`);
      errors.push('Connection failed: ' + e.message);
    }
  } else {
    console.log('    → Skipped (no token)');
  }

  // Step 4: Save bridge config
  console.log('\n  [4/5] Saving bridge config...');
  config.save(cfg);
  console.log(`    ✓ Saved to ${config.CONFIG_FILE}`);

  // Step 5: Patch openclaw.json
  console.log('\n  [5/5] Configuring OpenClaw...');
  if (fs.existsSync(OPENCLAW_CONFIG)) {
    try {
      const ocCfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf8'));

      // Ensure models.providers exists
      if (!ocCfg.models) ocCfg.models = {};
      if (!ocCfg.models.providers) ocCfg.models.providers = {};

      // Backup old anthropic config
      const oldAnthro = ocCfg.models.providers.anthropic;
      if (oldAnthro && oldAnthro.baseUrl !== `http://127.0.0.1:${cfg.port}`) {
        console.log(`    → Backing up current anthropic config`);
        ocCfg.models.providers['anthropic_backup_' + Date.now()] = { ...oldAnthro };
      }

      // Set new anthropic provider
      ocCfg.models.providers.anthropic = {
        baseUrl: `http://127.0.0.1:${cfg.port}`,
        apiKey: token || '${ANTHROPIC_API_KEY}',
        api: 'anthropic-messages',
        models: ANTHROPIC_MODELS,
      };

      // Ensure auth profile
      if (!ocCfg.auth) ocCfg.auth = {};
      if (!ocCfg.auth.profiles) ocCfg.auth.profiles = {};
      ocCfg.auth.profiles['anthropic:default'] = {
        provider: 'anthropic',
        mode: 'token',
      };

      // Ensure ANTHROPIC_API_KEY in env
      if (!ocCfg.env) ocCfg.env = {};
      if (token) {
        ocCfg.env.ANTHROPIC_API_KEY = token;
      }

      // Add model aliases if defaults exist
      if (ocCfg.agents?.defaults?.models) {
        ocCfg.agents.defaults.models['anthropic/claude-opus-4-6'] = { alias: 'opus' };
        ocCfg.agents.defaults.models['anthropic/claude-sonnet-4-6'] = { alias: 'sonnet' };
      }

      // Write
      fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(ocCfg, null, 2));
      console.log('    ✓ OpenClaw config updated');
      console.log('    → anthropic.baseUrl = http://127.0.0.1:' + cfg.port);
      console.log('    → Models: opus-4-6, sonnet-4-6, haiku-4-5');
      console.log('    → Auth mode: token (auto-refresh)');
    } catch (e) {
      console.log(`    ✗ Error updating OpenClaw config: ${e.message}`);
      errors.push('OpenClaw config error: ' + e.message);
    }
  } else {
    console.log('    ✗ ~/.openclaw/openclaw.json not found');
    console.log('    → Install OpenClaw first: npm install -g openclaw');
    errors.push('OpenClaw not found');
  }

  // Summary
  console.log('\n  ────────────────────────────────────────');
  if (errors.length === 0) {
    console.log('  ✓ Setup complete!\n');
    console.log('  Next steps:');
    console.log('    1. Start bridge:   openclaw-anthropic-bridge start');
    console.log('    2. Start openclaw: openclaw gateway start');
    console.log('    3. Admin UI:       http://127.0.0.1:' + cfg.port + '/admin');
    console.log('');
    console.log('  Run as service:');
    console.log('    openclaw-anthropic-bridge install-service');
    console.log('');
  } else {
    console.log('  ⚠ Setup completed with warnings:\n');
    errors.forEach(e => console.log('    • ' + e));
    console.log('');
  }

  rl.close();
}

// ─── Install systemd service ─────────────────────────────────

function installService() {
  const cfg = config.load();
  const nodePath = process.execPath;
  const cliPath = path.resolve(__dirname, 'cli.js');

  const serviceDir = path.join(HOME, '.config', 'systemd', 'user');
  const serviceFile = path.join(serviceDir, 'openclaw-anthropic-bridge.service');

  const unit = `[Unit]
Description=OpenClaw Anthropic Bridge
After=network.target

[Service]
ExecStart=${nodePath} ${cliPath} start
Restart=always
RestartSec=5
Environment=HOME=${HOME}

[Install]
WantedBy=default.target
`;

  fs.mkdirSync(serviceDir, { recursive: true });
  fs.writeFileSync(serviceFile, unit);

  console.log(`\n  Service file written to ${serviceFile}\n`);
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    execSync('systemctl --user enable openclaw-anthropic-bridge', { stdio: 'inherit' });
    execSync('systemctl --user start openclaw-anthropic-bridge', { stdio: 'inherit' });
    console.log('\n  ✓ Service installed and started');
    console.log('  → systemctl --user status openclaw-anthropic-bridge');
    console.log('  → journalctl --user -u openclaw-anthropic-bridge -f\n');
  } catch (e) {
    console.log('\n  Service file created. Enable manually:');
    console.log('    systemctl --user daemon-reload');
    console.log('    systemctl --user enable openclaw-anthropic-bridge');
    console.log('    systemctl --user start openclaw-anthropic-bridge\n');
  }
}

// ─── Interactive Setup ───────────────────────────────────────

async function setup() {
  console.log('\n  openclaw-anthropic-bridge setup\n');

  const cfg = config.load();

  const port = await ask(`  Port [${cfg.port}]: `);
  if (port) cfg.port = parseInt(port);

  console.log('\n  External proxy (needed if Anthropic is geo-blocked)');
  const proxy = await ask(`  Proxy [${cfg.proxy || 'none'}]: `);
  if (proxy && proxy !== 'none') cfg.proxy = proxy;
  else if (proxy === 'none' || proxy === '') cfg.proxy = null;

  console.log('\n  Request optimization:');

  const compactSys = await ask(`  Compact system prompt? [${cfg.compact.systemPrompt ? 'yes' : 'no'}]: `);
  if (compactSys) cfg.compact.systemPrompt = compactSys.toLowerCase().startsWith('y');

  if (cfg.compact.systemPrompt) {
    const maxLen = await ask(`  System prompt max length [${cfg.compact.systemPromptMaxLen}]: `);
    if (maxLen) cfg.compact.systemPromptMaxLen = parseInt(maxLen);
  }

  const compactTools = await ask(`  Compact tool descriptions? [${cfg.compact.toolDescriptions ? 'yes' : 'no'}]: `);
  if (compactTools) cfg.compact.toolDescriptions = compactTools.toLowerCase().startsWith('y');

  if (cfg.compact.toolDescriptions) {
    const maxDesc = await ask(`  Tool description max length [${cfg.compact.toolDescMaxLen}]: `);
    if (maxDesc) cfg.compact.toolDescMaxLen = parseInt(maxDesc);
  }

  const dedup = await ask(`  Deduplicate messages? [${cfg.compact.deduplicateMessages ? 'yes' : 'no'}]: `);
  if (dedup) cfg.compact.deduplicateMessages = dedup.toLowerCase().startsWith('y');

  config.save(cfg);
  console.log(`\n  ✓ Config saved to ${config.CONFIG_FILE}\n`);
  rl.close();
}

// ─── Status ──────────────────────────────────────────────────

async function showStatus() {
  const cfg = config.load();
  console.log('\n  openclaw-anthropic-bridge status\n');
  console.log(`  Port:              ${cfg.port}`);
  console.log(`  Proxy:             ${cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : 'direct'}`);
  console.log(`  Compact system:    ${cfg.compact.systemPrompt ? `yes (max ${cfg.compact.systemPromptMaxLen} chars)` : 'no'}`);
  console.log(`  Compact tools:     ${cfg.compact.toolDescriptions ? `yes (max ${cfg.compact.toolDescMaxLen} chars)` : 'no'}`);
  console.log(`  Dedup messages:    ${cfg.compact.deduplicateMessages ? 'yes' : 'no'}`);
  console.log(`  Config:            ${config.CONFIG_FILE}`);

  // Check Claude Code creds
  if (fs.existsSync(CLAUDE_CREDS)) {
    try {
      const creds = JSON.parse(fs.readFileSync(CLAUDE_CREDS, 'utf8'));
      const expires = creds?.claudeAiOauth?.expiresAt;
      if (expires) {
        const left = expires - Date.now();
        console.log(`  Token expires:     ${left > 0 ? Math.round(left / 60000) + ' min' : 'EXPIRED'}`);
      }
    } catch {}
  }

  // Check bridge running
  try {
    const resp = await fetch(`http://127.0.0.1:${cfg.port}/health`);
    const d = await resp.json();
    console.log(`  Bridge:            running (v${d.version})`);
  } catch {
    console.log(`  Bridge:            not running`);
  }

  // Check openclaw config
  if (fs.existsSync(OPENCLAW_CONFIG)) {
    try {
      const oc = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf8'));
      const base = oc?.models?.providers?.anthropic?.baseUrl;
      console.log(`  OpenClaw baseUrl:  ${base || 'not configured'}`);
      if (base && base.includes('127.0.0.1:' + cfg.port)) {
        console.log(`  OpenClaw → Bridge: ✓ connected`);
      } else {
        console.log(`  OpenClaw → Bridge: ✗ baseUrl doesn't point to bridge`);
      }
    } catch {}
  }
  console.log('');
}

// ─── Toggle features ─────────────────────────────────────────

function toggle(feature, value) {
  const cfg = config.load();
  const map = {
    'compact-system': ['compact', 'systemPrompt', 'System prompt compaction'],
    'compact-tools': ['compact', 'toolDescriptions', 'Tool description compaction'],
    'dedup': ['compact', 'deduplicateMessages', 'Message deduplication'],
  };
  const m = map[feature];
  if (!m) {
    console.log(`  Unknown feature: ${feature}`);
    console.log('  Available: compact-system, compact-tools, dedup');
    return;
  }
  cfg[m[0]][m[1]] = value;
  config.save(cfg);
  console.log(`  ${m[2]}: ${value ? 'ON' : 'OFF'}`);
  console.log('  Restart bridge to apply.');
}

// ─── CLI Router ──────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'auto-setup':
    autoSetup();
    break;
  case 'setup':
    setup();
    break;
  case 'start':
    start();
    break;
  case 'status':
    showStatus();
    break;
  case 'install-service':
    installService();
    break;
  case 'enable':
    toggle(args[0], true);
    break;
  case 'disable':
    toggle(args[0], false);
    break;
  default:
    console.log(`
  openclaw-anthropic-bridge - Anthropic API bridge for OpenClaw

  Commands:
    auto-setup            One-command automatic setup (recommended)
    setup                 Interactive manual setup
    start                 Start the bridge server
    status                Show status and diagnostics
    install-service       Install as systemd user service

    enable <feature>      Enable a feature
    disable <feature>     Disable a feature

  Features:
    compact-system        Compact system prompt to save tokens
    compact-tools         Truncate tool descriptions
    dedup                 Deduplicate consecutive identical messages

  Quick start:
    openclaw-anthropic-bridge auto-setup
    openclaw-anthropic-bridge start
`);
}
