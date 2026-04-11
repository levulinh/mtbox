import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentStatus, StatusResponse, RunInfo, ModelName, ProgrammerFlags } from './types';

// ── Agent config ──────────────────────────────────────────────────────────────

const AGENT_ORDER = ['cto', 'pm', 'designer', 'programmer'];

const AGENT_CONFIG: Record<string, { color: string; emoji: string; name: string; role: string }> = {
  pm:         { color: '#3b82f6', emoji: '📋', name: 'Ada',    role: 'PM' },
  cto:        { color: '#06b6d4', emoji: '🏗️',  name: 'Turing', role: 'CTO' },
  designer:   { color: '#a855f7', emoji: '🎨', name: 'Vera',   role: 'Designer' },
  programmer: { color: '#22c55e', emoji: '💻', name: 'Linus',  role: 'Programmer' },
};

const MODEL_OPTIONS: { value: ModelName; label: string }[] = [
  { value: 'haiku', label: 'Haiku' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function badgeClass(status: string): string {
  const map: Record<string, string> = {
    idle: 'badge-idle', busy: 'badge-busy', error: 'badge-error',
    never: 'badge-never', resting: 'badge-resting',
  };
  return map[status] || 'badge-never';
}

function formatCountdown(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '\u2014';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function agentDisplayStatus(agent: AgentStatus): string {
  if (agent.status === 'busy') return 'busy';
  if (agent.resting) return 'resting';
  return agent.status;
}

function colorLogLine(raw: string): string {
  const e = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (e.includes('\u{1F4AC}')) {
    const withTs = e.replace(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])\s*/, '<span class="log-ts">$1</span> ');
    return withTs.replace(/(\u{1F4AC}\s*)(.+)/u, '$1<span class="log-narration">$2</span>');
  }

  if (e.trimStart().startsWith('\u2192')) {
    return `<span class="log-tool">${e}</span>`;
  }

  if (e.includes('===')) {
    return `<span class="log-boundary">${e.replace(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])/, '<span class="log-ts">$1</span>')}</span>`;
  }

  return e
    .replace(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])/, '<span class="log-ts">$1</span>')
    .replace(/(error|failed|\u2717)/gi, '<span class="log-err">$1</span>')
    .replace(/(done\.|complete|\u2713|moved|pushed)/gi, '<span class="log-ok">$1</span>')
    .replace(/(fetching|reading|generating|creating|starting)/gi, '<span class="log-hi">$1</span>');
}

function formatRunDate(isoStr: string | null): string {
  if (!isoStr) return 'Legacy';
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sortedAgents(agents: AgentStatus[]): AgentStatus[] {
  return AGENT_ORDER.map(name => agents.find(a => a.name === name)).filter(Boolean) as AgentStatus[];
}

function queueEventsText(events: AgentStatus['queueEvents']): string {
  if (!events || events.length === 0) return '';
  return events.map(e => e.reason).join(', ');
}

const IS_MOBILE = () => window.innerWidth < 768;

// ── Timer state per agent ─────────────────────────────────────────────────────

interface AgentTimer {
  elapsed?: number;
  start?: number;
  restRemaining?: number;
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [statusData, setStatusData] = useState<StatusResponse>({
    agents: [], serverTime: 0, paused: false, pausedUntil: null, restMinutes: 15,
    models: { pm: 'haiku', cto: 'sonnet', designer: 'sonnet', programmer: 'sonnet' },
    programmerFlags: { skipCodeReview: false, bypassDesignApproval: false },
  });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({});
  const [timers, setTimers] = useState<Record<string, AgentTimer>>({});
  const [pauseCountdown, setPauseCountdown] = useState('');
  const [allRuns, setAllRuns] = useState<RunInfo[]>([]);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [lastSavedRestMinutes, setLastSavedRestMinutes] = useState(15);
  const [restInputValue, setRestInputValue] = useState('15');
  const [pauseDuration, setPauseDuration] = useState('');

  const sseSourceRef = useRef<WebSocket | null>(null);
  const mobileSseMapRef = useRef<Record<string, WebSocket>>({});
  const logOutputRef = useRef<HTMLDivElement>(null);
  const restDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusDataRef = useRef(statusData);
  const timersRef = useRef(timers);
  const selectedAgentRef = useRef(selectedAgent);
  const viewingFileRef = useRef(viewingFile);
  const allRunsRef = useRef(allRuns);

  // Keep refs in sync
  useEffect(() => { statusDataRef.current = statusData; }, [statusData]);
  useEffect(() => { timersRef.current = timers; }, [timers]);
  useEffect(() => { selectedAgentRef.current = selectedAgent; }, [selectedAgent]);
  useEffect(() => { viewingFileRef.current = viewingFile; }, [viewingFile]);
  useEffect(() => { allRunsRef.current = allRuns; }, [allRuns]);

  // ── fetchStatus ────────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      const data: StatusResponse = await res.json();
      setStatusData(data);
      setTimers(prev => {
        const next = { ...prev };
        for (const agent of data.agents) {
          if (agent.status === 'busy') {
            if (!next[agent.name] || next[agent.name].restRemaining !== undefined) {
              const start = agent.runStart ?? Date.now();
              next[agent.name] = { elapsed: Math.floor((Date.now() - start) / 1000), start };
            }
          } else if (agent.resting) {
            next[agent.name] = { restRemaining: agent.restRemaining ?? 0 };
          } else {
            next[agent.name] = {};
          }
        }
        return next;
      });
    } catch (e) {
      console.error('Status fetch failed', e);
    }
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ── Timer tick (1s) ────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      setTimers(prev => {
        const agents = statusDataRef.current.agents;
        const next = { ...prev };
        let changed = false;
        for (const agent of agents) {
          const t = next[agent.name];
          if (!t) continue;
          if (agent.status === 'busy' && t.start !== undefined) {
            const newElapsed = Math.floor((Date.now() - t.start) / 1000);
            if (newElapsed !== t.elapsed) {
              next[agent.name] = { ...t, elapsed: newElapsed };
              changed = true;
            }
          } else if (agent.resting && t.restRemaining !== undefined && t.restRemaining > 0) {
            next[agent.name] = { ...t, restRemaining: Math.max(0, t.restRemaining - 1) };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Pause countdown (1s) ───────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const { paused, pausedUntil } = statusDataRef.current;
      if (!paused || !pausedUntil) { setPauseCountdown(''); return; }
      const remaining = Math.max(0, Math.floor((new Date(pausedUntil).getTime() - Date.now()) / 1000));
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      const parts: string[] = [];
      if (h) parts.push(`${h}h`);
      if (m || h) parts.push(`${m}m`);
      parts.push(`${s}s`);
      setPauseCountdown(` \u2014 resumes in ${parts.join(' ')}`);
      if (remaining === 0) fetchStatus();
    }, 1000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ── Body class for paused ─────────────────────────────────────────────────

  useEffect(() => {
    if (statusData.paused) {
      document.body.classList.add('is-paused');
    } else {
      document.body.classList.remove('is-paused');
    }
  }, [statusData.paused]);

  // ── Sync rest input on settings open ─────────────────────────────────────

  useEffect(() => {
    if (settingsOpen) {
      setRestInputValue(String(statusData.restMinutes || 15));
    }
  }, [settingsOpen, statusData.restMinutes]);

  // ── WebSocket: start live log ─────────────────────────────────────────────
  // Uses WebSocket instead of EventSource — works through Cloudflare tunnels
  // (SSE/chunked HTTP is buffered by cloudflared; WebSocket Upgrade is not)

  const startLiveLog = useCallback((name: string) => {
    if (sseSourceRef.current) {
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }
    setLogLines([]);

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/logs/${name}`);
    sseSourceRef.current = ws;

    ws.onmessage = (e) => {
      setLogLines(prev => [...prev, e.data]);
    };
    ws.onerror = () => {
      setLogLines(prev => [...prev, '\u001b[err][connection error \u2014 retrying...]']);
    };
    ws.onclose = () => {
      // Auto-reconnect after 3s if this is still the active agent
      setTimeout(() => {
        if (sseSourceRef.current === ws) startLiveLog(name);
      }, 3000);
    };
  }, []);

  // ── Load static run ───────────────────────────────────────────────────────

  const loadStaticRun = useCallback(async (name: string, file: string) => {
    if (sseSourceRef.current) {
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }
    setLogLoading(true);
    setLogLines([]);
    try {
      const r = await fetch(`/logs/${name}/runs/${file}`);
      const text = await r.text();
      const lines = text.split('\n').filter(l => l.trim());
      setLogLines(lines);
    } catch {
      setLogLines(['\u001b[err][Failed to load run]']);
    } finally {
      setLogLoading(false);
    }
  }, []);

  // ── Open log viewer ───────────────────────────────────────────────────────

  const openLogViewer = useCallback(async (name: string) => {
    setAllRuns([]);
    setViewingFile(null);
    try {
      const r = await fetch(`/logs/${name}/runs`);
      const runs: RunInfo[] = await r.json();
      setAllRuns(runs);
    } catch {}
    startLiveLog(name);
  }, [startLiveLog]);

  // ── Auto-scroll log output ────────────────────────────────────────────────

  useEffect(() => {
    if (logOutputRef.current && viewingFile === null) {
      logOutputRef.current.scrollTop = logOutputRef.current.scrollHeight;
    }
  }, [logLines, viewingFile]);

  // ── Card click ────────────────────────────────────────────────────────────

  const handleCardClick = useCallback((name: string) => {
    if (IS_MOBILE()) {
      setMobileExpanded(prev => {
        const nowOpen = !prev[name];
        if (nowOpen) {
          // Start mobile WebSocket log stream
          const existing = mobileSseMapRef.current[name];
          if (existing) existing.close();
          const el = document.getElementById(`log-inline-${name}`);
          const container = el || document.createElement('div');
          container.innerHTML = '';
          const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/logs/${name}`);
          mobileSseMapRef.current[name] = ws;
          ws.onmessage = (e) => {
            const line = document.createElement('div');
            line.innerHTML = colorLogLine(e.data);
            container.appendChild(line);
            container.scrollTop = container.scrollHeight;
          };
          ws.onerror = () => {
            const line = document.createElement('div');
            line.style.color = '#e07070';
            line.textContent = '[connection error...]';
            container.appendChild(line);
          };
        } else {
          const src = mobileSseMapRef.current[name];
          if (src) { src.close(); delete mobileSseMapRef.current[name]; }
        }
        return { ...prev, [name]: nowOpen };
      });
      return;
    }
    setSelectedAgent(name);
    openLogViewer(name);
  }, [openLogViewer]);

  // ── Run navigation ────────────────────────────────────────────────────────

  const navigateRun = useCallback((direction: 1 | -1) => {
    const agent = selectedAgentRef.current;
    if (!agent) return;
    const runs = allRunsRef.current;
    const curFile = viewingFileRef.current;

    if (direction === 1) {
      // Newer
      if (curFile === null) return;
      const pos = runs.findIndex(r => r.file === curFile);
      if (pos === -1 || pos === 0) {
        setViewingFile(null);
        startLiveLog(agent);
      } else {
        const f = runs[pos - 1].file;
        setViewingFile(f);
        loadStaticRun(agent, f);
      }
    } else {
      // Older
      if (curFile === null) {
        // runs[0] is the same file Live is tailing — skip to runs[1]
        if (runs.length < 2) return;
        const f = runs[1].file;
        setViewingFile(f);
        loadStaticRun(agent, f);
      } else {
        const pos = runs.findIndex(r => r.file === curFile);
        if (pos === -1 || pos >= runs.length - 1) return;
        const f = runs[pos + 1].file;
        setViewingFile(f);
        loadStaticRun(agent, f);
      }
    }
  }, [startLiveLog, loadStaticRun]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const triggerAgent = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/trigger/${name}`, { method: 'POST' });
      setTimeout(fetchStatus, 500);
    } catch (err) { console.error('Trigger failed', err); }
  }, [fetchStatus]);

  const killAgent = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/kill/${name}`, { method: 'POST' });
      setTimeout(fetchStatus, 2500);
    } catch (err) { console.error('Kill failed', err); }
  }, [fetchStatus]);

  const skipRest = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/queue/${name}/skip-rest`, { method: 'POST' });
      setTimeout(fetchStatus, 300);
    } catch (err) { console.error('Skip rest failed', err); }
  }, [fetchStatus]);

  const clearQueue = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/queue/${name}/clear`, { method: 'POST' });
      setTimeout(fetchStatus, 300);
    } catch (err) { console.error('Clear queue failed', err); }
  }, [fetchStatus]);

  // ── Pause/resume ──────────────────────────────────────────────────────────

  const togglePause = useCallback(async () => {
    if (statusDataRef.current.paused) {
      try {
        await fetch('/resume', { method: 'POST' });
        setTimeout(fetchStatus, 200);
      } catch (e) { console.error('Resume failed', e); }
    } else {
      const mins = parseInt(pauseDuration || '0', 10);
      const body = mins > 0
        ? JSON.stringify({ resumeAt: new Date(Date.now() + mins * 60000).toISOString() })
        : '{}';
      try {
        await fetch('/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        setTimeout(fetchStatus, 200);
      } catch (e) { console.error('Pause failed', e); }
    }
  }, [fetchStatus, pauseDuration]);

  // ── Slow mode / rest duration ─────────────────────────────────────────────

  const setRestMinutes = useCallback(async (minutes: number) => {
    await fetch('/api/rest-duration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
    setStatusData(prev => ({ ...prev, restMinutes: minutes }));
  }, []);

  const toggleSlowMode = useCallback(async () => {
    const current = statusDataRef.current.restMinutes ?? 0;
    if (current > 0) setLastSavedRestMinutes(current);
    const newMinutes = current > 0 ? 0 : (lastSavedRestMinutes || 15);
    try {
      await setRestMinutes(newMinutes);
    } catch (err) { console.error('Failed to toggle slow mode', err); }
  }, [setRestMinutes, lastSavedRestMinutes]);

  const handleRestInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRestInputValue(val);
    if (restDebounceRef.current) clearTimeout(restDebounceRef.current);
    restDebounceRef.current = setTimeout(async () => {
      const minutes = parseInt(val, 10);
      if (isNaN(minutes) || minutes < 1) return;
      try {
        setLastSavedRestMinutes(minutes);
        await setRestMinutes(minutes);
      } catch (err) { console.error('Failed to set rest duration', err); }
    }, 500);
  }, [setRestMinutes]);

  // ── Model selection ────────────────────────────────────────────────────────

  const setAgentModel = useCallback(async (agent: string, model: ModelName) => {
    try {
      await fetch(`/api/models/${agent}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      setStatusData(prev => ({
        ...prev,
        models: { ...prev.models, [agent]: model },
      }));
    } catch (err) { console.error('Set model failed', err); }
  }, []);

  // ── Programmer flags ──────────────────────────────────────────────────────

  const toggleSkipCodeReview = useCallback(async () => {
    const next = !statusData.programmerFlags.skipCodeReview;
    try {
      await fetch('/api/programmer-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipCodeReview: next }),
      });
      setStatusData(prev => ({ ...prev, programmerFlags: { ...prev.programmerFlags, skipCodeReview: next } }));
    } catch (err) { console.error('Failed to update programmer flags', err); }
  }, [statusData.programmerFlags.skipCodeReview]);

  const toggleBypassDesignApproval = useCallback(async () => {
    const next = !statusData.programmerFlags.bypassDesignApproval;
    try {
      await fetch('/api/programmer-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bypassDesignApproval: next }),
      });
      setStatusData(prev => ({ ...prev, programmerFlags: { ...prev.programmerFlags, bypassDesignApproval: next } }));
    } catch (err) { console.error('Failed to update programmer flags', err); }
  }, [statusData.programmerFlags.bypassDesignApproval]);

  // ── Sidebar drag-to-resize ────────────────────────────────────────────────

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(180, Math.min(window.innerWidth * 0.5, startW + (ev.clientX - startX)));
      setSidebarWidth(newW);
      document.documentElement.style.setProperty('--sidebar-width', newW + 'px');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  // ── Cleanup WebSocket on unmount ──────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (sseSourceRef.current) sseSourceRef.current.close();
      for (const ws of Object.values(mobileSseMapRef.current)) ws.close();
    };
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const { agents, paused, pausedUntil, restMinutes, models } = statusData;
  const sorted = sortedAgents(agents);
  const isSlowMode = (restMinutes ?? 0) > 0;

  const runningCount = agents.filter(a => a.status === 'busy').length;
  const restingCount = agents.filter(a => a.resting).length;
  const totalQueued = agents.reduce((s, a) => s + (a.queueDepth || 0), 0);
  let headerMeta = `${agents.length} agents`;
  if (runningCount) headerMeta += ` \u00B7 ${runningCount} running`;
  if (restingCount) headerMeta += ` \u00B7 ${restingCount} resting`;
  if (totalQueued) headerMeta += ` \u00B7 ${totalQueued} queued`;

  // Run picker
  const isLive = viewingFile === null;
  const currentRunPos = isLive ? -1 : allRuns.findIndex(r => r.file === viewingFile);
  const isOldest = !isLive && currentRunPos === allRuns.length - 1;
  const selectedAgentData = agents.find(a => a.name === selectedAgent);

  // ── Render helpers ────────────────────────────────────────────────────────

  function timerText(agent: AgentStatus): string {
    if (agent.status === 'busy') {
      const elapsed = timers[agent.name]?.elapsed ?? 0;
      return `\u23F1 running ${formatCountdown(elapsed)}`;
    }
    if (agent.resting) {
      const rem = timers[agent.name]?.restRemaining ?? agent.restRemaining ?? 0;
      return `\u{1F4A4} rest ${formatCountdown(rem)}`;
    }
    return '';
  }

  function summaryText(agent: AgentStatus): string {
    if (agent.lastSummary) {
      const prefix = agent.status === 'error' ? '\u2717 ' : (agent.status === 'idle' && !agent.resting ? '\u2713 ' : '');
      return prefix + esc(agent.lastSummary);
    }
    return agent.status === 'never' ? 'Never run' : '\u2014';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div id="header">
        <h1>MTBox Agents</h1>
        <div id="header-right">
          <span id="header-meta">{headerMeta}</span>
          <span
            id="header-mode"
            className={isSlowMode ? 'slow' : 'fast'}
          >
            {isSlowMode ? `Slow ${restMinutes}m` : 'Fast'}
          </span>
          <button className="btn-gear" onClick={() => setSettingsOpen(true)} title="Settings">&#9881;</button>
        </div>
      </div>

      {/* Pause banner */}
      <div id="pause-banner" className={paused ? 'visible' : ''}>
        &#9208; Company paused &mdash; ongoing runs will finish, no new runs will start
        <span id="pause-countdown">{pauseCountdown}</span>
      </div>

      {/* Settings overlay */}
      <div
        id="settings-overlay"
        className={settingsOpen ? 'open' : ''}
        onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}
      >
        <div id="settings-dialog">
          <div className="settings-header">
            <h2>Settings</h2>
            <button className="btn-settings-close" onClick={() => setSettingsOpen(false)}>&times;</button>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Agent Models</div>
            <div className="model-grid">
              {AGENT_ORDER.map(name => {
                const cfg = AGENT_CONFIG[name];
                if (!cfg) return null;
                return (
                  <div key={name} className="model-row">
                    <span className="model-agent-label">
                      <span className="model-agent-emoji">{cfg.emoji}</span>
                      {cfg.name}
                    </span>
                    <div className="model-pills">
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          className={`model-pill${(models[name] || 'sonnet') === opt.value ? ' active' : ''}`}
                          onClick={() => setAgentModel(name, opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {name === 'programmer' && (
                      <div className="model-row-flag">
                        <span className="model-flag-label">Skip code review</span>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={statusData.programmerFlags.skipCodeReview}
                            onChange={toggleSkipCodeReview}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    )}
                    {name === 'designer' && (
                      <div className="model-row-flag">
                        <span className="model-flag-label">Bypass design approval</span>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={statusData.programmerFlags.bypassDesignApproval}
                            onChange={toggleBypassDesignApproval}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Pacing</div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Slow Mode</div>
                <div className="setting-desc">Rest between runs</div>
              </div>
              <div className="setting-control">
                <button
                  className={`toggle-btn${isSlowMode ? ' on' : ''}`}
                  id="toggle-slow"
                  onClick={toggleSlowMode}
                />
              </div>
            </div>
            {isSlowMode && (
              <div className="setting-row">
                <div>
                  <div className="setting-label">Rest Duration</div>
                  <div className="setting-desc">Cooldown between runs</div>
                </div>
                <div className="setting-control">
                  <input
                    type="number"
                    className="setting-input"
                    id="rest-input"
                    min={1}
                    max={720}
                    value={restInputValue}
                    onChange={handleRestInput}
                  />
                  <span className="setting-unit">min</span>
                </div>
              </div>
            )}
            {isSlowMode && (
              <div className="setting-row setting-row-presets">
                <div className="setting-label">Presets</div>
                <div className="setting-presets">
                  {[
                    { label: '5m', value: 5 },
                    { label: '10m', value: 10 },
                    { label: '15m', value: 15 },
                    { label: '30m', value: 30 },
                  ].map(({ label, value }) => (
                    <button
                      key={value}
                      className={`preset-btn${(restMinutes ?? 0) === value ? ' active' : ''}`}
                      onClick={() => {
                        setRestInputValue(String(value));
                        setLastSavedRestMinutes(value);
                        setRestMinutes(value);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Operations</div>
            <div className="setting-row">
              <div>
                <div className="setting-label">Pause Company</div>
                <div className="setting-desc">Stop all new runs</div>
              </div>
              <div className="setting-control">
                <select
                  className="setting-select"
                  id="pause-duration"
                  value={pauseDuration}
                  onChange={(e) => setPauseDuration(e.target.value)}
                >
                  <option value="">Indefinite</option>
                  <option value="30">30 min</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                  <option value="480">8 hours</option>
                  <option value="720">Overnight (12h)</option>
                </select>
              </div>
            </div>
            <div className="setting-row" style={{ justifyContent: 'center', borderBottom: 'none', paddingBottom: 0 }}>
              <button
                className={`btn btn-pause-setting${paused ? ' resume' : ' pause'}`}
                id="btn-pause-resume"
                onClick={togglePause}
              >
                {paused ? '\u25B6 Resume All' : '\u23F8 Pause All'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div id="main">
        {/* Sidebar */}
        <div id="sidebar" style={{ width: sidebarWidth }}>
          {sorted.map(agent => {
            const cfg = AGENT_CONFIG[agent.name] || { color: '#aaa', emoji: '?', name: agent.name, role: '' };
            const displayStatus = agentDisplayStatus(agent);
            const statusCls = displayStatus === 'busy' ? 'is-busy' : displayStatus === 'error' ? 'is-error' : displayStatus === 'resting' ? 'is-resting' : '';
            const selectedCls = selectedAgent === agent.name ? 'selected' : '';
            const timerCls = agent.status === 'busy' ? ' running' : agent.resting ? ' resting' : '';
            const qDepth = agent.queueDepth || 0;
            const qText = queueEventsText(agent.queueEvents);
            const isMobileExpanded = IS_MOBILE() && mobileExpanded[agent.name];

            return (
              <div
                key={agent.name}
                className={`agent-card ${statusCls} ${selectedCls}`.trim()}
                style={{ '--agent-color': cfg.color } as React.CSSProperties}
                data-agent={agent.name}
                onClick={() => handleCardClick(agent.name)}
              >
                <div className="card-top">
                  <div>
                    <div className="card-identity">
                      <span className="card-emoji">{cfg.emoji}</span>
                      <span className="card-name">{cfg.name || agent.name.toUpperCase()}</span>
                    </div>
                    <div className="card-role">{cfg.role} <span className="card-model">{models[agent.name] || 'sonnet'}</span></div>
                  </div>
                  <div className="card-btns">
                    {agent.resting && (
                      <button
                        className="btn btn-skip-rest"
                        onClick={(e) => skipRest(agent.name, e)}
                        title="Skip rest period"
                      >
                        &#9654; Wake
                      </button>
                    )}
                    {agent.status === 'busy' ? (
                      <button
                        className="btn btn-stop"
                        onClick={(e) => killAgent(agent.name, e)}
                        title="Stop agent"
                      >
                        &#9632; Stop
                      </button>
                    ) : (
                      <button
                        className="btn"
                        onClick={(e) => triggerAgent(agent.name, e)}
                      >
                        &#9654; Run
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-mid">
                  <span className={`badge ${badgeClass(displayStatus)}`}>{displayStatus.toUpperCase()}</span>
                  <span className={`timer${timerCls}`} id={`timer-${agent.name}`}>{timerText(agent)}</span>
                </div>
                <div className="queue-info">
                  <span className={`queue-badge${qDepth === 0 ? ' empty' : ''}`}>{qDepth}</span>
                  <span>queued</span>
                  {qDepth > 0 && (
                    <span className="queue-events">{qText}</span>
                  )}
                  {qDepth > 0 && (
                    <button
                      className="btn btn-small"
                      onClick={(e) => clearQueue(agent.name, e)}
                      title="Clear queue"
                    >
                      &#x2715;
                    </button>
                  )}
                </div>
                <div
                  className="card-summary"
                  dangerouslySetInnerHTML={{ __html: summaryText(agent) }}
                />
                {/* Mobile inline log */}
                <div
                  className={`card-log-inline${isMobileExpanded ? ' open' : ''}`}
                  id={`log-inline-${agent.name}`}
                />
              </div>
            );
          })}
        </div>

        {/* Resize divider */}
        <div id="divider" onMouseDown={handleDividerMouseDown} />

        {/* Log viewer */}
        <div id="log-viewer">
          {!selectedAgent ? (
            <div id="log-placeholder"><span>Select an agent to view logs</span></div>
          ) : (
            <>
              <div className="log-viewer-header" id="log-header">
                <span className="log-viewer-title">
                  <span className={`live-dot${selectedAgentData?.status === 'busy' ? ' busy' : ''}`} id="live-dot" />
                  <span id="log-viewer-agent-name">{selectedAgent.toUpperCase()}</span>
                </span>
                <span
                  id="log-live-label"
                  style={{ color: '#2a9d2a', fontSize: '9px', display: isLive ? '' : 'none' }}
                >
                  &#9679; Live
                </span>
                <span className="log-viewer-spacer" />
                <div id="run-picker" className={allRuns.length > 0 ? 'visible' : ''}>
                  <button
                    className="btn btn-nav"
                    id="btn-prev"
                    onClick={() => navigateRun(-1)}
                    disabled={isOldest}
                  >
                    &#8592; Prev
                  </button>
                  <span id="run-label">
                    {isLive
                      ? '\u25CF Live'
                      : (() => {
                          const run = allRuns[currentRunPos];
                          return run ? (run.startedAt ? formatRunDate(run.startedAt) : run.file) : '\u2014';
                        })()
                    }
                  </span>
                  <button
                    className="btn btn-nav"
                    id="btn-next"
                    onClick={() => navigateRun(1)}
                    disabled={isLive}
                  >
                    Latest &#8594;
                  </button>
                </div>
              </div>
              <div id="log-output" ref={logOutputRef}>
                {logLoading && <div style={{ color: '#555' }}>Loading...</div>}
                {!logLoading && logLines.map((line, i) => {
                  if (line.startsWith('\u001b[err]')) {
                    return (
                      <div key={i} style={{ color: '#e07070' }}>
                        {line.slice(7)}
                      </div>
                    );
                  }
                  if (!line.trim()) return null;
                  return (
                    <div key={i} dangerouslySetInnerHTML={{ __html: colorLogLine(line) }} />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
