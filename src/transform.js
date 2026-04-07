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

  // 4. Prompt caching — add cache_control to system blocks
  if (config.caching.enabled && Array.isArray(parsed.system)) {
    const ttl = config.caching.ttl || '5m';
    const scope = config.caching.scope || null;
    parsed.system = parsed.system.map((block, i) => {
      // Cache the last (largest) system block, or all if configured
      const shouldCache = config.caching.cacheAll ? true : (i === parsed.system.length - 1);
      if (shouldCache && !block.cache_control) {
        return {
          ...block,
          cache_control: {
            type: "ephemeral",
            ...(ttl !== '5m' ? { ttl } : {}),
            ...(scope ? { scope } : {}),
          }
        };
      }
      return block;
    });
  }

  // 5. Cache tools — add cache_control to last tool
  if (config.caching.enabled && config.caching.cacheTools && parsed.tools && parsed.tools.length > 0) {
    const lastIdx = parsed.tools.length - 1;
    if (!parsed.tools[lastIdx].cache_control) {
      parsed.tools[lastIdx] = {
        ...parsed.tools[lastIdx],
        cache_control: { type: "ephemeral" }
      };
    }
  }

  // 6. Cache last user message
  if (config.caching.enabled && config.caching.cacheMessages && parsed.messages && parsed.messages.length > 0) {
    const lastMsg = parsed.messages[parsed.messages.length - 1];
    if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
      const lastContent = lastMsg.content[lastMsg.content.length - 1];
      if (lastContent && !lastContent.cache_control) {
        lastContent.cache_control = { type: "ephemeral" };
      }
    }
  }

  // 7. Compact system prompt (only if compaction enabled AND caching disabled)
  if (config.compact.systemPrompt && !config.caching.enabled && Array.isArray(parsed.system)) {
    parsed.system = parsed.system.map(block => {
      if (block.text && block.text.length > config.compact.systemPromptMaxLen) {
        block = { ...block, text: compactSystemPrompt(block.text, config) };
      }
      return block;
    });
  }

  // 8. Compact tool descriptions (only if compaction enabled AND tool caching disabled)
  if (config.compact.toolDescriptions && !(config.caching.enabled && config.caching.cacheTools) && parsed.tools) {
    parsed.tools = parsed.tools.map(tool => ({
      ...tool,
      description: tool.description && tool.description.length > config.compact.toolDescMaxLen
        ? tool.description.substring(0, config.compact.toolDescMaxLen) + '...'
        : tool.description
    }));
  }

  // 9. Deduplicate consecutive identical messages (always available)
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

  let compacted = sections[0];
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

  out['anthropic-beta'] = config.betaFeatures.join(',');
  out['user-agent'] = `claude-cli/${config.claudeVersion} (external, cli)`;
  out['x-app'] = 'cli';
  out['X-Claude-Code-Session-Id'] = sessionId;
  out['anthropic-dangerous-direct-browser-access'] = 'true';

  if (!out['anthropic-version']) {
    out['anthropic-version'] = '2023-06-01';
  }

  return out;
}

module.exports = { transformRequest, transformHeaders };
