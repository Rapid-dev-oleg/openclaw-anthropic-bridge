# openclaw-anthropic-bridge

[English](#english) | [Русский](#русский)

---

## English

Local proxy bridge that connects [OpenClaw](https://github.com/nicholasgriffintn/openclaw) to Anthropic's Claude API (Opus 4.6, Sonnet 4.6, Haiku 4.5) using Claude Code OAuth tokens.

### Why?

OpenClaw doesn't natively support Claude Code OAuth authentication. Node.js `fetch()` ignores system proxy settings, causing 403 errors in geo-blocked regions. This bridge solves both problems — sits between OpenClaw and the Anthropic API, transparently handling auth, headers, proxy routing, and request optimization.

```
OpenClaw → localhost:3456 (bridge) → [external proxy] → api.anthropic.com
```

### Features

- **One-command setup** — `auto-setup` reads Claude Code credentials, tests the connection, patches OpenClaw config, all automatically
- **Admin UI** — Web dashboard at `/admin` with real-time request logs and settings panel
- **Claude Code OAuth** — Adds all required headers: billing, session IDs, beta features, metadata, thinking config
- **Geo-blocking bypass** — Routes through external HTTP proxy with auth (for Russia, China, etc.)
- **Token optimization** — Compacts system prompts, truncates tool descriptions, deduplicates messages. Each toggle on/off
- **Full streaming** — SSE streaming pass-through with proper header handling
- **Update-proof** — Zero SDK patches; survives any OpenClaw or npm update
- **systemd service** — One command to install as a background service

### Quick Start

```bash
# Install
npm install -g openclaw-anthropic-bridge

# Auto-setup (recommended) — detects token, tests API, patches openclaw config
openclaw-anthropic-bridge auto-setup

# Start
openclaw-anthropic-bridge start

# Or install as service
openclaw-anthropic-bridge install-service
```

That's it. OpenClaw will now use Claude models through the bridge.

### Admin UI

Open `http://127.0.0.1:3456/admin` in your browser:

- **Logs tab** — Real-time request log with model, status, tokens, duration. Auto-refresh. Click row for details.
- **Settings tab** — Toggle system prompt compaction, tool description truncation, message dedup. Change proxy. Save & restart.

### Commands

```bash
auto-setup            # One-command automatic setup (recommended)
setup                 # Interactive manual setup
start                 # Start the bridge server
status                # Show status, token expiry, diagnostics
install-service       # Install as systemd user service

enable <feature>      # Enable: compact-system, compact-tools, dedup
disable <feature>     # Disable a feature
```

### Configuration

Bridge config: `~/.openclaw-anthropic-bridge/config.json`

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

### How It Works

1. **URL** — Appends `?beta=true` to `/v1/messages`
2. **Headers** — Adds `anthropic-beta`, `user-agent`, `x-app`, `X-Claude-Code-Session-Id`
3. **Body** — Adds `metadata.user_id`, `thinking`, `output_config`, billing system prompt
4. **Optimization** — Compacts system prompts (configurable limit), truncates tool descriptions, deduplicates consecutive identical messages
5. **Proxy** — Routes through external HTTP proxy if configured (undici ProxyAgent)
6. **Streaming** — Strips `content-encoding` to prevent double-decompression, streams SSE chunks

### Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed and logged in (`~/.claude/.credentials.json`)
- [OpenClaw](https://github.com/nicholasgriffintn/openclaw) installed
- Node.js 18+

---

## Русский

Локальный прокси-мост между [OpenClaw](https://github.com/nicholasgriffintn/openclaw) и Anthropic Claude API (Opus 4.6, Sonnet 4.6, Haiku 4.5) с поддержкой Claude Code OAuth токенов.

### Зачем?

OpenClaw не поддерживает Claude Code OAuth нативно. Node.js `fetch()` игнорирует системные настройки прокси, что вызывает ошибки 403 в гео-заблокированных регионах. Bridge решает обе проблемы — стоит между OpenClaw и Anthropic API, прозрачно обрабатывая авторизацию, заголовки, маршрутизацию через прокси и оптимизацию запросов.

```
OpenClaw → localhost:3456 (bridge) → [внешний прокси] → api.anthropic.com
```

### Возможности

- **Настройка одной командой** — `auto-setup` читает credentials Claude Code, тестирует подключение, патчит конфиг OpenClaw — всё автоматически
- **Админка** — Веб-панель на `/admin` с логами запросов в реальном времени и настройками
- **Claude Code OAuth** — Добавляет все необходимые заголовки: billing, session ID, beta-фичи, metadata, thinking
- **Обход гео-блокировки** — Маршрутизация через внешний HTTP прокси с авторизацией (РФ, Китай и др.)
- **Оптимизация токенов** — Компактит system prompt, обрезает описания tools, убирает дубли сообщений. Каждая опция вкл/выкл
- **Полный streaming** — SSE streaming с корректной обработкой заголовков
- **Не ломается при обновлениях** — Никаких патчей SDK; переживает любое обновление OpenClaw или npm
- **systemd сервис** — Одна команда для установки как фоновый сервис

### Быстрый старт

```bash
# Установка
npm install -g openclaw-anthropic-bridge

# Авто-настройка (рекомендуется) — найдёт токен, проверит API, настроит openclaw
openclaw-anthropic-bridge auto-setup

# Запуск
openclaw-anthropic-bridge start

# Или установить как сервис
openclaw-anthropic-bridge install-service
```

Готово. OpenClaw теперь использует модели Claude через bridge.

### Админка

Откройте `http://127.0.0.1:3456/admin` в браузере:

- **Вкладка Logs** — Логи запросов в реальном времени: модель, статус, токены, длительность. Автообновление. Клик по строке — детали.
- **Вкладка Settings** — Переключатели компакции prompt/tools/dedup. Настройка прокси. Сохранение.

### Команды

```bash
auto-setup            # Автоматическая настройка (рекомендуется)
setup                 # Интерактивная ручная настройка
start                 # Запуск bridge
status                # Статус, время жизни токена, диагностика
install-service       # Установка как systemd сервис

enable <feature>      # Включить: compact-system, compact-tools, dedup
disable <feature>     # Выключить
```

### Требования

- [Claude Code](https://claude.ai/code) CLI установлен и залогинен (`~/.claude/.credentials.json`)
- [OpenClaw](https://github.com/nicholasgriffintn/openclaw) установлен
- Node.js 18+

## License

MIT
