const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.HOME || '/root', '.openclaw-anthropic-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  port: 3456,
  proxy: null,          // "http://user:pass@host:port"
  claudeVersion: "2.1.92",
  caching: {
    enabled: true,          // use Anthropic prompt caching (recommended)
    ttl: "1h",              // cache TTL: "5m" or "1h"
    scope: "global",        // cache scope: null or "global"
    cacheAll: false,        // cache all system blocks (false = only last)
    cacheTools: true,       // cache tool definitions
    cacheMessages: true,    // cache last user message
  },
  compact: {
    systemPrompt: false,    // compact system prompt (disabled when caching on)
    systemPromptMaxLen: 8000,
    toolDescriptions: false, // truncate tool descriptions (disabled when caching on)
    toolDescMaxLen: 200,
    deduplicateMessages: true, // always useful
  },
  // essential sections to keep when compacting system prompt
  essentialSections: [
    "Tooling", "Tool Call Style", "Safety", "Memory",
    "Reply Tags", "Messaging", "Session Startup", "Runtime",
    "Core Truths", "Identity", "Vibe"
  ],
  betaFeatures: [
    "claude-code-20250219",
    "oauth-2025-04-20",
    "interleaved-thinking-2025-05-14",
    "redact-thinking-2026-02-12",
    "context-management-2025-06-27",
    "prompt-caching-scope-2026-01-05",
    "advanced-tool-use-2025-11-20",
    "effort-2025-11-24"
  ],
  metadata: {
    deviceId: null,      // auto-generated if null
    accountUuid: null,    // auto-detected from token
  },
  billingHeader: "cc_version=2.1.92.4a1; cc_entrypoint=cli; cch=54136;",
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function load() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...DEFAULTS, ...stored, compact: { ...DEFAULTS.compact, ...stored.compact }, caching: { ...DEFAULTS.caching, ...(stored.caching || {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = { load, save, CONFIG_FILE, CONFIG_DIR, DEFAULTS };
