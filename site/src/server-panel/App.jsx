import { useEffect, useMemo, useRef, useState, useCallback} from "react";
import "./App.css";

const API = "http://localhost:7000";

//utils
function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatUptime(seconds) {
  if (!seconds) return "Offline";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// API helpers
async function apiGet(path) {
  const response = await fetch(API + path, {
    headers: { "x-panel-key": "123456" }
  });

  if (!response.ok) throw new Error("API error");
  return response.json();
}

async function apiPost(path) {
  await fetch(API + path, {
    method: "POST",
    headers: { "x-panel-key": "123456" }
  });
}

//Routing
function parseHash() {
  const hash = window.location.hash || "#/servers";
  const parts = hash.replace("#", "").split("/").filter(Boolean);

  if (parts[0] === "servers") {
    return { page: "servers" };
  }

  if (parts[0] === "server" && parts[1]) {
    return {
      page: "server",
      id: parts[1],
      tab: parts[2] === "files" ? "files" : "console"
    };
  }

  return { page: "servers" };
}

function go(path) {
  window.location.hash = path;
}

//Components
function StatCard({ title, value, sub, progress }) {
  const percent = progress == null ? 0 : clamp(progress, 0, 100);

  return (
    <div className="card">
      <div className="cardHead">
        <div className="cardTitle">{title}</div>
      </div>

      <div className="cardValue">{value}</div>
      <div className="cardSub">{sub}</div>

      <div className="bar">
        <div
          className="barFill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ServersPage() {
  const [status, setStatus] = useState("...");

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiGet("/server/status");
      setStatus(data.running ? "RUNNING" : "STOPPED");
    } catch {
      setStatus("Offline");
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const servers = [
    {
      id: "local-1",
      name: "My Minecraft Server",
      plan: "Level 1",
      ram: "2 GB",
      disk: "10 GB",
      status
    }
  ];

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="dot" />
          <div>
            <div className="brandTitle">Your Servers</div>
            <div className="brandSub">Select a server</div>
          </div>
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={loadStatus}>
            Refresh
          </button>
        </div>
      </div>

      <div className="serversList">
        {servers.map((server) => (
          <div
            key={server.id}
            onClick={() => go(`#/server/${server.id}/console`)}
            className="serverRow"
          >
            <div className="serverLeft">
              <div className="serverIcon" />

              <div>
                <div className="serverName">{server.name}</div>
                <div className="serverSub">
                  {server.plan} • {server.ram} RAM • {server.disk} Disk
                </div>
              </div>
            </div>

            <div className="serverRight">
              <div
                className={`pill ${
                  server.status === "RUNNING" ? "ok" : "off"
                }`}
              >
                {server.status}
              </div>

              <div className="serverHint">
                Click to open console
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerPage({ id, tab }) {
  const [status, setStatus] = useState("...");
  const [logs, setLogs] = useState([]);
  const [command, setCommand] = useState("");
  const [metrics, setMetrics] = useState({
    running: false,
    cpuPercent: 0,
    memUsed: 0,
    memLimit: 0,
    diskUsed: 0,
    diskTotal: 0,
    uptimeSeconds: 0
  });

  const wsRef = useRef(null);
  const logBoxRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiGet("/server/status");
      setStatus(data.running ? "RUNNING" : "STOPPED");
    } catch {
      setStatus("Offline");
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await apiGet("/server/metrics");
      setMetrics((prev) => ({ ...prev, ...data }));
    } catch {}
  }, []);

  useEffect(() => {

    const interval = setInterval(() => {
      loadStatus();
      loadMetrics();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadStatus, loadMetrics]);

  const bufferRef = useRef([]);

  // WS console
  useEffect(() => {
  if (tab !== "console") return;

  let ws;
  let isAlive = true;

  const connect = () => {
    ws = new WebSocket("ws://localhost:7000/ws/console");
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "log") {
          bufferRef.current.push(message.line);
        }
      } catch {}
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (isAlive) setTimeout(connect, 1000);
    };
  };

  connect();

  return () => {
    isAlive = false;
    try {
      ws?.close();
    } catch {}
  };
}, [tab]);

useEffect(() => {
  if (tab !== "console") return;

  const interval = setInterval(() => {
    if (bufferRef.current.length === 0) return;

    const chunk = bufferRef.current;
    bufferRef.current = [];

    setLogs(prev => {
      const next = [...prev, ...chunk];
      return next.slice(-1200);
    });
  }, 100);

  return () => clearInterval(interval);
}, [tab]);

useEffect(() => {
    if (tab !== "console") return;
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, tab]);

  const postAction = async (url) => {
    await apiPost(url);
    loadStatus();
    loadMetrics();
  };

  const sendCommand = () => {
    const text = command.trim();
    if (!text) return;

    try {
      wsRef.current?.send(JSON.stringify({ type: "cmd", cmd: text }));
    } catch {}

    setCommand("");
  };

  const memoryPercent = useMemo(() => {
    if (!metrics.memLimit) return 0;
    return (metrics.memUsed / metrics.memLimit) * 100;
  }, [metrics.memUsed, metrics.memLimit]);

  const diskPercent = useMemo(() => {
    if (!metrics.diskTotal) return 0;
    return (metrics.diskUsed / metrics.diskTotal) * 100;
  }, [metrics.diskUsed, metrics.diskTotal]);

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="dot" />
          <div>
            <div className="brandTitle">Server</div>
            <div className="brandSub">ID: {id}</div>
          </div>
        </div>

        <div className="actions">
          <div className={`pill ${status === "RUNNING" ? "ok" : "off"}`}>
            {status}
          </div>

          <button className="btn" onClick={() => postAction("/server/start")}>
            Start
          </button>
          <button className="btn" onClick={() => postAction("/server/stop")}>
            Stop
          </button>
          <button className="btn" onClick={() => postAction("/server/restart")}>
            Restart
          </button>
          <button className="btn ghost" onClick={() => go("#/servers")}>
            ← Back
          </button>
        </div>
      </div>

      <div className="tabsBar">
        <div
          className={`tab ${tab === "console" ? "active" : ""}`}
          onClick={() => go(`#/server/${id}/console`)}
        >
          ›_ Console
        </div>

        <div
          className={`tab ${tab === "files" ? "active" : ""}`}
          onClick={() => go(`#/server/${id}/files`)}
        >
          Files
        </div>
      </div>

      {tab === "console" ? (
        <>
          <div className="consoleCard">
            <div className="consoleBody" ref={logBoxRef}>
              {logs.map((line, index) => (
                <div className="logLine" key={index}>
                  {line}
                </div>
              ))}
            </div>

            <div className="consoleInput">
              <span className="prompt">{">>"}</span>

              <input
                className="input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCommand()}
                placeholder="Type command..."
                disabled={!metrics.running}
              />

              <button
                className="btn"
                onClick={sendCommand}
                disabled={!metrics.running}
              >
                Send
              </button>
            </div>
          </div>

          <div className="sectionTitle">Dashboard</div>

          <div className="grid">
            <StatCard
              title="CPU"
              value={`${metrics.cpuPercent.toFixed(1)}%`}
              sub="load"
              progress={metrics.cpuPercent}
            />

            <StatCard
              title="Memory"
              value={formatBytes(metrics.memUsed)}
              sub={`of ${formatBytes(metrics.memLimit)} (${memoryPercent.toFixed(
                1
              )}%)`}
              progress={memoryPercent}
            />

            <StatCard
              title="Disk"
              value={formatBytes(metrics.diskUsed)}
              sub={`of ${formatBytes(metrics.diskTotal)} (${diskPercent.toFixed(
                1
              )}%)`}
              progress={diskPercent}
            />

            <StatCard
              title="Uptime"
              value={formatUptime(metrics.uptimeSeconds)}
              sub={metrics.running ? "Online" : "Offline"}
              progress={metrics.running ? 100 : 0}
            />
          </div>
        </>
      ) : (
        <div className="filesCard">File manager placeholder</div>
      )}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", handleHashChange);

    return () =>
      window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (route.page === "servers") {
    return <ServersPage />;
  }

  return <ServerPage id={route.id} tab={route.tab} />;
}
