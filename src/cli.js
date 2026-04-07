#!/usr/bin/env node
const readline = require('readline');
const config = require('./config');
const { start } = require('./server');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function setup() {
  console.log('\n  openclaw-anthropic-bridge setup\n');

  const cfg = config.load();

  // Port
  const port = await ask(`  Port [${cfg.port}]: `);
  if (port) cfg.port = parseInt(port);

  // Proxy
  console.log('\n  External proxy (needed if Anthropic is geo-blocked)');
  console.log('  Format: http://user:pass@host:port (leave empty for direct)');
  const proxy = await ask(`  Proxy [${cfg.proxy || 'none'}]: `);
  if (proxy && proxy !== 'none') cfg.proxy = proxy;
  else if (proxy === 'none' || proxy === '') cfg.proxy = null;

  // Compact options
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

  console.log(`\n  Config saved to ${config.CONFIG_FILE}`);
  console.log('\n  Add to your openclaw.json:');
  console.log(`
  "anthropic": {
    "baseUrl": "http://127.0.0.1:${cfg.port}",
    "apiKey": "your-oauth-token-here",
    "api": "anthropic-messages",
    "models": [
      {
        "id": "claude-opus-4-6",
        "name": "Claude Opus 4.6",
        "api": "anthropic-messages",
        "reasoning": true,
        "input": ["text", "image"],
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
        "contextWindow": 200000,
        "maxTokens": 16000
      },
      {
        "id": "claude-sonnet-4-6",
        "name": "Claude Sonnet 4.6",
        "api": "anthropic-messages",
        "reasoning": true,
        "input": ["text", "image"],
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
        "contextWindow": 200000,
        "maxTokens": 16000
      },
      {
        "id": "claude-haiku-4-5-20251001",
        "name": "Claude Haiku 4.5",
        "api": "anthropic-messages",
        "reasoning": false,
        "input": ["text"],
        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
        "contextWindow": 200000,
        "maxTokens": 8192
      }
    ]
  }
  `);
  console.log('  Then start the bridge:');
  console.log('  openclaw-anthropic-bridge start\n');

  rl.close();
}

async function showStatus() {
  const cfg = config.load();
  console.log('\n  openclaw-anthropic-bridge status\n');
  console.log(`  Port:              ${cfg.port}`);
  console.log(`  Proxy:             ${cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : 'direct'}`);
  console.log(`  Compact system:    ${cfg.compact.systemPrompt ? `yes (max ${cfg.compact.systemPromptMaxLen} chars)` : 'no'}`);
  console.log(`  Compact tools:     ${cfg.compact.toolDescriptions ? `yes (max ${cfg.compact.toolDescMaxLen} chars)` : 'no'}`);
  console.log(`  Dedup messages:    ${cfg.compact.deduplicateMessages ? 'yes' : 'no'}`);
  console.log(`  Config:            ${config.CONFIG_FILE}\n`);
}

async function toggle(feature, value) {
  const cfg = config.load();
  if (feature === 'compact-system') {
    cfg.compact.systemPrompt = value;
    console.log(`  System prompt compaction: ${value ? 'ON' : 'OFF'}`);
  } else if (feature === 'compact-tools') {
    cfg.compact.toolDescriptions = value;
    console.log(`  Tool description compaction: ${value ? 'ON' : 'OFF'}`);
  } else if (feature === 'dedup') {
    cfg.compact.deduplicateMessages = value;
    console.log(`  Message deduplication: ${value ? 'ON' : 'OFF'}`);
  } else {
    console.log(`  Unknown feature: ${feature}`);
    console.log('  Available: compact-system, compact-tools, dedup');
    return;
  }
  config.save(cfg);
  console.log(`  Saved. Restart bridge to apply.`);
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'setup':
    setup();
    break;
  case 'start':
    start();
    break;
  case 'status':
    showStatus();
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
    setup                 Interactive setup wizard
    start                 Start the bridge server
    status                Show current configuration

    enable <feature>      Enable a feature
    disable <feature>     Disable a feature

  Features:
    compact-system        Compact system prompt to save tokens
    compact-tools         Truncate tool descriptions
    dedup                 Deduplicate consecutive identical messages

  Examples:
    openclaw-anthropic-bridge setup
    openclaw-anthropic-bridge start
    openclaw-anthropic-bridge enable compact-system
    openclaw-anthropic-bridge disable dedup
`);
}
