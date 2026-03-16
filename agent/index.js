import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import Docker from "dockerode";
import { Rcon } from "rcon-client";
import os from "os";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGO_URL);
console.log("MongoDB connected");

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
  if (!(await isRunning())) return;

  const container = await getContainer();

  if (logStream) {
    logStream.destroy();
    logStream = null;
  }

  logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100
  });

  logStream.on("data", (chunk) => {
    broadcast(chunk.toString());
  });

  logStream.on("error", (err) => {
    console.error("Docker log stream error:", err);
  });

  logStream.on("end", () => {
    logStream = null;
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
      logStream.destroy();
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

//AUTH

app.post("/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Fill all fields" });

    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ error: "User exists" });

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      username,
      passwordHash: hash
    });

    res.json({ message: "User created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user)
      return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




server.listen(7000, () => {
  console.log("Agent running on http://localhost:7000");
});
