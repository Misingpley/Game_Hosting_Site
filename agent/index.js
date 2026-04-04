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

//CORS для фронта
app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws/console"
});

const docker = new Docker();
const CONTAINER_NAME = "mc-mvp-server";

//Утіли
function bytes(value) {
  return typeof value === "number" ? value : 0;
}

async function containerExists() {
  const containers = await docker.listContainers({ all: true });
  return containers.some((c) =>
    c.Names?.includes("/" + CONTAINER_NAME)
  );
}

async function getContainer() {
  return docker.getContainer(CONTAINER_NAME);
}

async function isRunning() {
  if (!(await containerExists())) return false;

  const container = await getContainer();
  const info = await container.inspect();
  return info.State.Running;
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

//WebSocket

function broadcast(line) {
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "log", line }));
    }
  }
}

let logStream = null;

async function streamLogs() {
  if (logStream) return;

  if (!(await isRunning())) return;

  const container = await getContainer();

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

    broadcast(buffer);
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

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === "cmd") {
        const rcon = await Rcon.connect({
          host: "127.0.0.1",
          port: Number(process.env.RCON_PORT),
          password: process.env.RCON_PASSWORD
        });

        const output = await rcon.send(message.cmd);
        await rcon.end();

        broadcast("> " + message.cmd);
        if (output) broadcast(output);
      }
    } catch (error) {
      broadcast("[RCON error] " + String(error));
    }
  });
});

//REST API
app.get("/server/status", async (_req, res) => {
  res.json({
    exists: await containerExists(),
    running: await isRunning()
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

    const container = await getContainer();
    const stats = await container.stats({ stream: false });

    res.json({
      running: true,
      cpuPercent: calcCpu(stats),
      memUsed: bytes(stats.memory_stats?.usage),
      memLimit: bytes(stats.memory_stats?.limit)
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/server/start", async (_req, res) => {
  try {
    const container = await getContainer();
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
    const container = await getContainer();
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
    const container = await getContainer();

    await container.restart();
    await streamLogs();

    res.json({ ok: true });
  } catch (error) {
    console.error("Restart error:", error);
    res.status(500).json({ error: String(error) });
  }
});

server.listen(7000, () => {
  console.log("Agent running on http://localhost:7000");
});
