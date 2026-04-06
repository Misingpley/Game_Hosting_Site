import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import Docker from "dockerode";
import { Rcon } from "rcon-client";
import os from "os";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws/console"
});

const docker = new Docker();
const CONTAINER_NAME = "mc-mvp-server";

//UTILS

function bytes(value) {
  return typeof value === "number" ? value : 0;
}

async function isRunning() {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const info = await container.inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}

function calcCpu(stats) {
  const cpuDelta =
    bytes(stats.cpu_stats?.cpu_usage?.total_usage) -
    bytes(stats.precpu_stats?.cpu_usage?.total_usage);

  const systemDelta =
    bytes(stats.cpu_stats?.system_cpu_usage) -
    bytes(stats.precpu_stats?.system_cpu_usage);

  const cpuCount =
    stats.cpu_stats?.online_cpus || os.cpus().length || 1;

  if (systemDelta > 0 && cpuDelta > 0) {
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }

  return 0;
}

//WEBSOCKET

function broadcast(line) {
  const payload = JSON.stringify({ type: "log", line });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (e) {
        console.error("WS send error:", e);
      }
    }
  }
}

let logStream = null;

async function streamLogs() {
  if (logStream) return;

  if (!(await isRunning())) return;

  const container = docker.getContainer(CONTAINER_NAME);

  logStream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true
  });

  let buffer = "";

  logStream.on("data", (chunk) => {
    buffer += chunk.toString();

    if (buffer.length > 20000) {
      buffer = buffer.slice(-10000);
    }
  });

  const interval = setInterval(() => {
    if (!buffer) return;

  const lines = buffer.split("\n");

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      broadcast(`[${new Date().toLocaleTimeString()}] ${line}`);
    }

    buffer = "";
  }, 100);

  logStream.on("end", () => {
    clearInterval(interval);
    logStream = null;
  });

  logStream.on("error", (err) => {
    console.error("Docker log stream error:", err);
  });
}

//WS

wss.on("connection", (ws) => {
  console.log("WS client connected");
  ws.on("message", async (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === "cmd") {
        const cmd = message.cmd?.trim();
          if (!cmd || cmd.length > 200) return;

        const rcon = await Rcon.connect({
          host: "127.0.0.1",
          port: Number(process.env.RCON_PORT),
          password: process.env.RCON_PASSWORD
        });

        const output = await rcon.send(cmd);
        await rcon.end();

        broadcast("> " + cmd);
        if (output) broadcast(output);

      }
    } catch (error) {
      console.error(error);
      broadcast("[RCON error] ");
    }
  });
  ws.on("close", () => {
    console.log("WS client disconnected");
  });
});

//REST API

app.get("/server/status", async (_req, res) => {
  const running = await isRunning();

  res.json({
    exists: running,
    running
  });
});

app.get("/server/metrics", async (_req, res) => {
  try {
    if (!(await isRunning())) {
      return res.json({
        running: false,
        cpuPercent: 0,
        memUsed: 0,
        memLimit: 0
      });
    }

    const container = docker.getContainer(CONTAINER_NAME);
    const stats = await container.stats({ stream: false });

    res.json({
      running: true,
      cpuPercent: calcCpu(stats),
      memUsed: stats.memory_stats?.usage || 0,
      memLimit: stats.memory_stats?.limit || 0
    });
  } catch (error) {
    console.error("Metrics error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/server/start", async (_req, res) => {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const running = await isRunning();

    if (!running) {
      await container.start();
    }

    await streamLogs();

    res.json({ ok: true });
  } catch (error) {
    console.error("Start error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/server/stop", async (_req, res) => {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const running = await isRunning();

    if (running) {
      await container.stop();
    }

    if (logStream) {
      logStream.removeAllListeners();
      logStream = null;
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Stop error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/server/restart", async (_req, res) => {
  try {
    const container = docker.getContainer(CONTAINER_NAME);

    await container.restart();
    await streamLogs();

    res.json({ ok: true });
  } catch (error) {
    console.error("Restart error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// ===== START =====

const PORT = process.env.PORT || 7000;

server.listen(PORT, () => {
  console.log("Agent running on http://localhost:" + PORT);
});