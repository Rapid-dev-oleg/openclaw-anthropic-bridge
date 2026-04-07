# openclaw-anthropic-bridge

[English](#english) | [Русский](#русский)

---

## English

Local proxy bridge that connects [OpenClaw](https://github.com/nicholasgriffintn/openclaw) to Anthropic's Claude API using Claude Code OAuth tokens.

Runs as a lightweight local service on `localhost`. OpenClaw sends requests to the bridge, and the bridge transforms them to match Anthropic's Claude Code API format, optionally routing through an external proxy for geo-blocked regions.

```
OpenClaw → localhost:3456 (bridge) → [optional proxy] → api.anthropic.com
```

### Key Features

- **Claude Code OAuth** — Adds all required headers, metadata, billing, session IDs, and beta features
- **Geo-blocking bypass** — Routes through external HTTP proxy (for Russia, China, etc.)
- **Token optimization** — Compacts system prompts, truncates tool descriptions, deduplicates messages
- **Streaming** — Full SSE streaming pass-through
- **Update-proof** — No SDK patches; survives any OpenClaw update
- **Configurable** — Toggle each optimization on/off via CLI

---

## Русский

Локальный прокси-мост между [OpenClaw](https://github.com/nicholasgriffintn/openclaw) и Anthropic Claude API с поддержкой Claude Code OAuth токенов.

Работает как легковесный локальный сервис на `localhost`. OpenClaw отправляет запросы в bridge, а bridge трансформирует их в формат Anthropic Claude Code API и опционально маршрутизирует через внешний прокси для обхода гео-блокировки.

```
OpenClaw → localhost:3456 (bridge) → [внешний прокси] → api.anthropic.com
```

### Возможности

- **Claude Code OAuth** — Добавляет все необходимые заголовки, metadata, billing, session ID и beta-фичи
- **Обход гео-блокировки** — Маршрутизация через внешний HTTP прокси (для РФ, Китая и др.)
- **Оптимизация токенов** — Компактит system prompt, обрезает описания tools, убирает дубли сообщений
- **Streaming** — Полная поддержка SSE streaming
- **Не ломается при обновлениях** — Никаких патчей SDK; переживает любое обновление OpenClaw
- **Настраиваемый** — Каждая оптимизация включается/выключается через CLI

---

## Why?

OpenClaw doesn't natively support Claude Code OAuth authentication. This bridge sits between OpenClaw and the Anthropic API, transparently adding all required headers, metadata, and request transformations so Claude models (Opus 4.6, Sonnet 4.6, Haiku 4.5) work seamlessly.

```
OpenClaw → localhost:3456 (bridge) → [optional proxy] → api.anthropic.com
```

## Features

- **Claude Code OAuth support** — Adds required billing headers, session IDs, beta features, and metadata
- **Geo-blocking bypass** — Routes requests through an external HTTP proxy (for regions where Anthropic is blocked by Cloudflare)
- **System prompt compaction** — Trims large system prompts to save input tokens (configurable)
- **Tool description compaction** — Truncates verbose tool descriptions (configurable)
- **Message deduplication** — Removes consecutive duplicate messages (configurable)
- **Streaming support** — Full SSE streaming pass-through
- **Zero SDK patching** — No modifications to OpenClaw or its dependencies; survives updates

## Quick Start

```bash
# Install
npm install -g openclaw-anthropic-bridge

# Setup (interactive)
openclaw-anthropic-bridge setup

# Start
openclaw-anthropic-bridge start
```

## Configuration

### Bridge Config

Run `openclaw-anthropic-bridge setup` or edit `~/.openclaw-anthropic-bridge/config.json`:

```json
{
  "port": 3456,
  "proxy": "http://user:pass@host:port",
  "compact": {
    "systemPrompt": true,
    "systemPromptMaxLen": 8000,
    "toolDescriptions": true,
    "toolDescMaxLen": 200,
    "deduplicateMessages": true
  }
}
```

### OpenClaw Config

Add to your `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "baseUrl": "http://127.0.0.1:3456",
        "apiKey": "sk-ant-oat01-YOUR-OAUTH-TOKEN",
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
    }
  }
}
```

## Commands

```bash
openclaw-anthropic-bridge setup              # Interactive setup wizard
openclaw-anthropic-bridge start              # Start the bridge server
openclaw-anthropic-bridge status             # Show current configuration

openclaw-anthropic-bridge enable <feature>   # Enable a feature
openclaw-anthropic-bridge disable <feature>  # Disable a feature
```

### Features

| Feature | Description | Default |
|---------|-------------|---------|
| `compact-system` | Compact system prompts to save tokens | ON |
| `compact-tools` | Truncate tool descriptions | ON |
| `dedup` | Remove consecutive duplicate messages | ON |

### Examples

```bash
# Disable system prompt compaction
openclaw-anthropic-bridge disable compact-system

# Enable message deduplication
openclaw-anthropic-bridge enable dedup
```

## How It Works

The bridge intercepts requests from OpenClaw and transforms them to match what Anthropic's API expects from Claude Code clients:

1. **URL** — Appends `?beta=true` to `/v1/messages`
2. **Headers** — Adds `anthropic-beta`, `user-agent`, `x-app`, `X-Claude-Code-Session-Id`
3. **Body** — Adds `metadata.user_id`, `thinking`, `output_config`, billing system prompt
4. **Optimization** — Compacts system prompts, tool descriptions, deduplicates messages
5. **Proxy** — Routes through external HTTP proxy if configured

## Getting Your OAuth Token

1. Log in to [Claude Code](https://claude.ai/code) CLI: `claude`
2. Your token is stored in `~/.claude/.credentials.json`
3. Copy the `accessToken` value (starts with `sk-ant-oat01-`)

Note: OAuth tokens expire periodically. If OpenClaw supports `mode: "token"` in auth profiles, it will handle refresh automatically.

## Running as a Service

### systemd

```bash
cat > ~/.config/systemd/user/openclaw-anthropic-bridge.service << EOF
[Unit]
Description=OpenClaw Anthropic Bridge

[Service]
ExecStart=$(which node) $(which openclaw-anthropic-bridge) start
Restart=always

[Install]
WantedBy=default.target
EOF

systemctl --user enable openclaw-anthropic-bridge
systemctl --user start openclaw-anthropic-bridge
```

## License

MIT
