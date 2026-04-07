const crypto = require('crypto');

// Session ID persists across requests
let sessionId = crypto.randomUUID();

function transformRequest(body, headers, config) {
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;

  // 1. Add metadata if missing
  if (!parsed.metadata) {
    const deviceId = config.metadata?.deviceId || crypto.randomBytes(32).toString('hex');
    const accountUuid = config.metadata?.accountUuid || crypto.randomUUID();
    parsed.metadata = {
      user_id: JSON.stringify({
        device_id: deviceId,
        account_uuid: accountUuid,
        session_id: sessionId,
      })
    };
  }

  // 2. Add thinking if missing and model supports it
  const model = parsed.model || '';
  const supportsThinking = model.includes('opus') || model.includes('sonnet-4');
  if (!parsed.thinking && supportsThinking) {
    parsed.thinking = { type: "adaptive" };
  }
  if (!parsed.output_config && supportsThinking) {
    parsed.output_config = { effort: "medium" };
  }

  // 3. Add/prepend billing header to system
  if (!parsed.system) {
    parsed.system = [];
  }
  if (Array.isArray(parsed.system)) {
    const hasBilling = parsed.system.some(s => s.text && s.text.includes('x-anthropic-billing-header'));
    if (!hasBilling) {
      parsed.system.unshift({
        type: "text",
        text: `x-anthropic-billing-header: ${config.billingHeader}`
      });
    }
    const hasClaudeCode = parsed.system.some(s => s.text && s.text.includes('You are Claude Code'));
    if (!hasClaudeCode) {
      parsed.system.splice(1, 0, {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude."
      });
    }
  }

  // 4. Compact system prompt
  if (config.compact.systemPrompt && Array.isArray(parsed.system)) {
    parsed.system = parsed.system.map(block => {
      if (block.text && block.text.length > config.compact.systemPromptMaxLen) {
        block = { ...block, text: compactSystemPrompt(block.text, config) };
      }
      return block;
    });
  }

  // 5. Compact tool descriptions
  if (config.compact.toolDescriptions && parsed.tools) {
    parsed.tools = parsed.tools.map(tool => ({
      ...tool,
      description: tool.description && tool.description.length > config.compact.toolDescMaxLen
        ? tool.description.substring(0, config.compact.toolDescMaxLen) + '...'
        : tool.description
    }));
  }

  // 6. Deduplicate consecutive identical messages
  if (config.compact.deduplicateMessages && parsed.messages) {
    const deduped = [parsed.messages[0]];
    for (let i = 1; i < parsed.messages.length; i++) {
      if (JSON.stringify(parsed.messages[i]) !== JSON.stringify(parsed.messages[i - 1])) {
        deduped.push(parsed.messages[i]);
      }
    }
    parsed.messages = deduped;
  }

  return parsed;
}

function compactSystemPrompt(text, config) {
  const maxLen = config.compact.systemPromptMaxLen;
  const sections = text.split('\n## ');
  const essential = new Set(config.essentialSections);

  let compacted = sections[0]; // header before first ##
  for (let i = 1; i < sections.length; i++) {
    const title = sections[i].split('\n')[0].trim();
    const isEssential = [...essential].some(e => title.includes(e));
    if (isEssential) {
      compacted += '\n## ' + sections[i];
    } else {
      compacted += '\n## ' + title + '\n';
    }
    if (compacted.length > maxLen) break;
  }
  return compacted.substring(0, maxLen);
}

function transformHeaders(headers, config) {
  const out = { ...headers };

  // Set beta features
  out['anthropic-beta'] = config.betaFeatures.join(',');

  // Set user-agent
  out['user-agent'] = `claude-cli/${config.claudeVersion} (external, cli)`;

  // Set identity headers
  out['x-app'] = 'cli';
  out['X-Claude-Code-Session-Id'] = sessionId;
  out['anthropic-dangerous-direct-browser-access'] = 'true';

  // Ensure anthropic-version
  if (!out['anthropic-version']) {
    out['anthropic-version'] = '2023-06-01';
  }

  return out;
}

module.exports = { transformRequest, transformHeaders };
