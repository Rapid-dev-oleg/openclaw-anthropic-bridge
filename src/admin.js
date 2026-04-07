const config = require('./config');

function getAdminHTML() {
  const cfg = config.load();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anthropic Bridge</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e0; min-height: 100vh; }
.header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px 30px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #2a2a4a; }
.header h1 { font-size: 18px; font-weight: 600; color: #fff; }
.header .status { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; }
.header .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; }
.header .dot.off { background: #f87171; }
.tabs { display: flex; background: #111118; border-bottom: 1px solid #2a2a4a; }
.tab { padding: 12px 24px; cursor: pointer; font-size: 14px; color: #888; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab:hover { color: #ccc; background: #1a1a28; }
.tab.active { color: #818cf8; border-bottom-color: #818cf8; }
.content { max-width: 900px; margin: 0 auto; padding: 24px; }
.panel { display: none; }
.panel.active { display: block; }

/* Settings */
.card { background: #14141f; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.card h3 { font-size: 14px; color: #818cf8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.field { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1e1e30; }
.field:last-child { border-bottom: none; }
.field label { font-size: 14px; color: #ccc; }
.field .desc { font-size: 12px; color: #666; margin-top: 2px; }
.field input[type="text"], .field input[type="number"] {
  background: #1a1a28; border: 1px solid #2a2a4a; border-radius: 6px; padding: 8px 12px;
  color: #e0e0e0; font-size: 13px; width: 280px; font-family: 'SF Mono', monospace;
}
.field input:focus { outline: none; border-color: #818cf8; }
.toggle { position: relative; width: 44px; height: 24px; cursor: pointer; }
.toggle input { display: none; }
.toggle .slider { position: absolute; inset: 0; background: #2a2a4a; border-radius: 12px; transition: 0.2s; }
.toggle input:checked + .slider { background: #818cf8; }
.toggle .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .slider:before { transform: translateX(20px); }
.btn { background: #818cf8; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: 0.2s; }
.btn:hover { background: #6366f1; }
.btn.secondary { background: #2a2a4a; }
.btn.secondary:hover { background: #3a3a5a; }
.save-bar { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.toast { position: fixed; bottom: 20px; right: 20px; background: #4ade80; color: #000; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; opacity: 0; transition: 0.3s; pointer-events: none; }
.toast.show { opacity: 1; }

/* Logs */
.log-controls { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }
.log-controls .count { margin-left: auto; font-size: 13px; color: #666; }
.log-table { width: 100%; border-collapse: collapse; }
.log-table th { text-align: left; padding: 8px 12px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2a2a4a; }
.log-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #1a1a28; font-family: 'SF Mono', monospace; }
.log-table tr:hover { background: #1a1a28; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge.s200 { background: #064e3b; color: #4ade80; }
.badge.s429 { background: #451a03; color: #fb923c; }
.badge.s400, .badge.s403 { background: #450a0a; color: #f87171; }
.badge.s500 { background: #450a0a; color: #f87171; }
.model-opus { color: #c084fc; }
.model-sonnet { color: #60a5fa; }
.model-haiku { color: #4ade80; }
.empty { text-align: center; padding: 40px; color: #444; font-size: 14px; }
.log-detail { display: none; background: #0d0d14; padding: 12px; border-radius: 6px; margin: 4px 0; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }
</style>
</head>
<body>
<div class="header">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
  <h1>Anthropic Bridge</h1>
  <div class="status"><div class="dot" id="statusDot"></div><span id="statusText">connected</span></div>
</div>
<div class="tabs">
  <div class="tab active" data-tab="logs">Logs</div>
  <div class="tab" data-tab="settings">Settings</div>
</div>
<div class="content">
  <!-- LOGS PANEL -->
  <div class="panel active" id="logs">
    <div class="log-controls">
      <button class="btn secondary" onclick="clearLogs()">Clear</button>
      <button class="btn secondary" onclick="loadLogs()">Refresh</button>
      <label class="toggle" title="Auto-refresh">
        <input type="checkbox" id="autoRefresh" checked>
        <span class="slider"></span>
      </label>
      <span style="font-size:12px;color:#666">Auto</span>
      <span class="count" id="logCount">0 requests</span>
    </div>
    <table class="log-table">
      <thead><tr><th>Time</th><th>Model</th><th>Status</th><th>Tokens</th><th>Size</th><th>Duration</th></tr></thead>
      <tbody id="logBody"></tbody>
    </table>
    <div class="empty" id="emptyLogs">No requests yet</div>
  </div>

  <!-- SETTINGS PANEL -->
  <div class="panel" id="settings">
    <div class="card">
      <h3>Server</h3>
      <div class="field">
        <div><label>Port</label><div class="desc">Bridge listening port</div></div>
        <input type="number" id="port" value="${cfg.port}">
      </div>
      <div class="field">
        <div><label>External Proxy</label><div class="desc">HTTP proxy for geo-blocking bypass</div></div>
        <input type="text" id="proxy" value="${cfg.proxy || ''}" placeholder="http://user:pass@host:port">
      </div>
    </div>
    <div class="card">
      <h3>Optimization</h3>
      <div class="field">
        <div><label>Compact System Prompt</label><div class="desc">Trim large system prompts to save tokens</div></div>
        <label class="toggle"><input type="checkbox" id="compactSystem" ${cfg.compact.systemPrompt ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="field">
        <div><label>System Prompt Max Length</label><div class="desc">Characters limit</div></div>
        <input type="number" id="systemMaxLen" value="${cfg.compact.systemPromptMaxLen}">
      </div>
      <div class="field">
        <div><label>Compact Tool Descriptions</label><div class="desc">Truncate verbose tool descriptions</div></div>
        <label class="toggle"><input type="checkbox" id="compactTools" ${cfg.compact.toolDescriptions ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="field">
        <div><label>Tool Description Max Length</label><div class="desc">Characters limit</div></div>
        <input type="number" id="toolMaxLen" value="${cfg.compact.toolDescMaxLen}">
      </div>
      <div class="field">
        <div><label>Deduplicate Messages</label><div class="desc">Remove consecutive duplicate messages</div></div>
        <label class="toggle"><input type="checkbox" id="dedup" ${cfg.compact.deduplicateMessages ? 'checked' : ''}><span class="slider"></span></label>
      </div>
    </div>
    <div class="save-bar">
      <button class="btn" onclick="saveSettings()">Save & Restart</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Toast
function toast(msg, ok=true) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = ok ? '#4ade80' : '#f87171';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// Settings
async function saveSettings() {
  const body = {
    port: parseInt(document.getElementById('port').value),
    proxy: document.getElementById('proxy').value || null,
    compact: {
      systemPrompt: document.getElementById('compactSystem').checked,
      systemPromptMaxLen: parseInt(document.getElementById('systemMaxLen').value),
      toolDescriptions: document.getElementById('compactTools').checked,
      toolDescMaxLen: parseInt(document.getElementById('toolMaxLen').value),
      deduplicateMessages: document.getElementById('dedup').checked,
    }
  };
  try {
    const r = await fetch('/api/config', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    toast(d.ok ? 'Saved! Restart bridge to apply.' : 'Error: ' + d.error, d.ok);
  } catch(e) { toast('Error: ' + e.message, false); }
}

// Logs
let logs = [];
async function loadLogs() {
  try {
    const r = await fetch('/api/logs');
    logs = await r.json();
    renderLogs();
  } catch(e) {}
}

function renderLogs() {
  const body = document.getElementById('logBody');
  const empty = document.getElementById('emptyLogs');
  document.getElementById('logCount').textContent = logs.length + ' requests';
  if (!logs.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = logs.slice().reverse().map((l, i) => {
    const modelClass = l.model?.includes('opus') ? 'model-opus' : l.model?.includes('sonnet') ? 'model-sonnet' : 'model-haiku';
    const statusClass = 's' + (l.status || 0);
    const time = new Date(l.time).toLocaleTimeString();
    return '<tr onclick="toggleDetail(this)" style="cursor:pointer">' +
      '<td>' + time + '</td>' +
      '<td class="' + modelClass + '">' + (l.model || '?') + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + (l.status || '...') + '</span></td>' +
      '<td>' + (l.inputTokens || '-') + '</td>' +
      '<td>' + formatBytes(l.bodySize) + '</td>' +
      '<td>' + (l.durationMs ? l.durationMs + 'ms' : '-') + '</td>' +
    '</tr>' +
    '<tr><td colspan="6"><div class="log-detail" id="detail-' + i + '">' +
      'Headers: ' + JSON.stringify(l.reqHeaders || {}, null, 2) +
      '\\n\\nResponse: ' + (l.respPreview || '') +
    '</div></td></tr>';
  }).join('');
}

function toggleDetail(row) {
  const detail = row.nextElementSibling?.querySelector('.log-detail');
  if (detail) detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
}

function formatBytes(b) {
  if (!b) return '-';
  if (b < 1024) return b + 'B';
  return (b/1024).toFixed(1) + 'KB';
}

async function clearLogs() {
  await fetch('/api/logs', { method: 'DELETE' });
  logs = [];
  renderLogs();
  toast('Logs cleared');
}

// Auto refresh
setInterval(() => {
  if (document.getElementById('autoRefresh').checked) loadLogs();
}, 3000);

// Health check
async function checkHealth() {
  try {
    const r = await fetch('/health');
    const d = await r.json();
    document.getElementById('statusDot').className = 'dot';
    document.getElementById('statusText').textContent = 'connected';
  } catch {
    document.getElementById('statusDot').className = 'dot off';
    document.getElementById('statusText').textContent = 'disconnected';
  }
}
setInterval(checkHealth, 5000);

loadLogs();
</script>
</body>
</html>`;
}

module.exports = { getAdminHTML };
