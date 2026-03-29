# Wendor Toolkit

A lightweight, kiosk-style React + Node.js dashboard for Raspberry Pi 5 with a 480x320 SPI TFT display. Designed for low resource usage, touch input, and minimal lag.

**Target URL:** `http://localhost:3000`

## 1. High-level Architecture Summary
- **Frontend:** React + Vite, minimal DOM, fixed 480x320 layout, dark theme, touch-first controls.
- **Backend:** Node.js + Express, lightweight system APIs via Linux commands.
- **Production:** One process: Express serves API + static frontend build on port 3000.
- **Dev:** Vite on port 3000 with `/api` proxy to Express on port 3001.

## 2. Folder Structure
```
/ (repo root)
  client/                 # React app (Vite)
    src/
      App.jsx
      main.jsx
      styles.css
    index.html
    vite.config.js
    package.json
  server/                 # Express backend
    data/sample.log
    server.js
    package.json
  ecosystem.config.js     # PM2 config
  package.json            # helper scripts
  README.md
```

## 3. Full Source Code for All Files
### `package.json`
```json
{
  "name": "wendor-toolkit",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "install:all": "npm --prefix server install && npm --prefix client install",
    "dev:server": "npm --prefix server run dev",
    "dev:client": "npm --prefix client run dev",
    "build": "npm --prefix client run build",
    "start": "npm --prefix server start"
  }
}
```

### `ecosystem.config.js`
```js
module.exports = {
  apps: [
    {
      name: "wendor-toolkit",
      cwd: "/home/zigg/zigg/server",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        STATIC_DIR: "/home/zigg/zigg/client/dist"
      }
    }
  ]
};
```

### `server/package.json`
```json
{
  "name": "wendor-toolkit-server",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "dev": "NODE_ENV=development PORT=3001 node server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

### `server/server.js`
```js
const express = require("express");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "..", "client", "dist");

function run(cmd, args = [], timeout = 1200) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout).trim());
    });
  });
}

async function safe(cmd, args = [], timeout = 1200) {
  try {
    return await run(cmd, args, timeout);
  } catch (e) {
    return "";
  }
}

function listDevByPrefix(prefixes) {
  try {
    const items = fs.readdirSync("/dev");
    return items
      .filter((d) => prefixes.some((p) => d.startsWith(p)))
      .map((d) => `/dev/${d}`)
      .sort();
  } catch {
    return [];
  }
}

function parseHostnameIp(hostnameOutput) {
  const parts = hostnameOutput.split(/\s+/).filter(Boolean);
  return parts[0] || "";
}

function parseIpAddrs(ipOutput) {
  const ips = [];
  const lines = ipOutput.split("\n");
  for (const line of lines) {
    const m = line.match(/inet\s+([0-9.]+)\//);
    if (m) ips.push(m[1]);
  }
  return ips;
}

function parseGateway(routeOutput) {
  const lines = routeOutput.split("\n");
  for (const line of lines) {
    if (line.startsWith("default")) {
      const parts = line.split(/\s+/);
      const viaIndex = parts.indexOf("via");
      if (viaIndex >= 0 && parts[viaIndex + 1]) return parts[viaIndex + 1];
    }
  }
  return "";
}

function parseWifiSignal(iwLinkOutput) {
  const line = iwLinkOutput.split("\n").find((l) => l.includes("signal:"));
  if (!line) return "";
  const m = line.match(/signal:\s+(-?\d+)\s+dBm/);
  return m ? `${m[1]} dBm` : "";
}

function parseLsblk(lsblkOutput) {
  const lines = lsblkOutput.split("\n").filter(Boolean);
  const entries = [];
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [name, mountpoint, size, type, ...modelParts] = parts;
    entries.push({
      name,
      mountpoint: mountpoint === "-" ? "" : mountpoint,
      size,
      type,
      model: modelParts.join(" "),
    });
  }
  return entries;
}

function nowLocal() {
  const d = new Date();
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

app.get("/api/status", async (_req, res) => {
  const [hostnameIp, ssid, usbRaw] = await Promise.all([
    safe("hostname", ["-I"]),
    safe("iwgetid", ["-r"]),
    safe("lsusb"),
  ]);

  const serialPorts = listDevByPrefix(["ttyUSB", "ttyACM", "ttyS", "ttyAMA"]);

  res.json({
    timeLocal: nowLocal(),
    ip: parseHostnameIp(hostnameIp),
    ssid: ssid || "",
    wifi: ssid ? "connected" : "disconnected",
    usbCount: usbRaw ? usbRaw.split("\n").filter(Boolean).length : 0,
    serialCount: serialPorts.length,
  });
});

app.get("/api/network", async (_req, res) => {
  const [ssid, iwLink, ipAll, ipWlan, ipEth, route, pingRes, nmcli, hostname, macWlan, macEth] = await Promise.all([
    safe("iwgetid", ["-r"]),
    safe("iw", ["dev", "wlan0", "link"]),
    safe("ip", ["-4", "addr", "show"]),
    safe("ip", ["-4", "addr", "show", "wlan0"]),
    safe("ip", ["-4", "addr", "show", "eth0"]),
    safe("ip", ["route"]),
    safe("ping", ["-c", "1", "-W", "1", "1.1.1.1"]),
    safe("nmcli", ["-t", "-f", "ssid,signal", "dev", "wifi"], 2000),
    safe("hostname"),
    safe("cat", ["/sys/class/net/wlan0/address"]),
    safe("cat", ["/sys/class/net/eth0/address"]),
  ]);

  const nearby = nmcli
    ? nmcli
        .split("\n")
        .filter(Boolean)
        .slice(0, 8)
        .map((line) => {
          const [n, s] = line.split(":");
          return { ssid: n || "(hidden)", signal: s ? `${s}%` : "" };
        })
    : [];

  res.json({
    hostname: hostname || "",
    ssid: ssid || "",
    signal: parseWifiSignal(iwLink),
    ipAll: parseIpAddrs(ipAll),
    wlan0: parseIpAddrs(ipWlan)[0] || "",
    eth0: parseIpAddrs(ipEth)[0] || "",
    macWlan: macWlan || "",
    macEth: macEth || "",
    gateway: parseGateway(route),
    internet: pingRes ? "yes" : "no",
    routes: route ? route.split("\n").filter(Boolean).slice(0, 6) : [],
    nearby,
  });
});

app.get("/api/devices", async (_req, res) => {
  const [usbRaw, lsblk] = await Promise.all([
    safe("lsusb"),
    safe("lsblk", ["-o", "NAME,MOUNTPOINT,SIZE,TYPE,MODEL"]),
  ]);

  const usbDevices = usbRaw ? usbRaw.split("\n").filter(Boolean) : [];
  const block = lsblk ? parseLsblk(lsblk) : [];
  const mounted = block.filter((b) => b.mountpoint);

  const ttyDevices = listDevByPrefix(["ttyUSB", "ttyACM", "ttyS", "ttyAMA"]);

  res.json({
    usbDevices,
    ttyDevices,
    mounted,
  });
});

app.get("/api/serial", async (_req, res) => {
  const ports = listDevByPrefix(["ttyUSB", "ttyACM", "ttyS", "ttyAMA"]);
  res.json({
    ports,
    baudPresets: ["9600", "19200", "38400", "57600", "115200", "230400"],
  });
});

app.get("/api/system", async (_req, res) => {
  const [loadavg, mem, uptime, disk, temp] = await Promise.all([
    safe("cat", ["/proc/loadavg"]),
    safe("free", ["-m"]),
    safe("uptime", ["-p"]),
    safe("df", ["-h", "/"]),
    safe("vcgencmd", ["measure_temp"]),
  ]);

  const memLines = mem.split("\n");
  const memParts = memLines[1] ? memLines[1].split(/\s+/).filter(Boolean) : [];
  const memTotal = memParts[1] || "";
  const memUsed = memParts[2] || "";
  const memFree = memParts[3] || "";

  const diskLines = disk.split("\n");
  const diskParts = diskLines[1] ? diskLines[1].split(/\s+/).filter(Boolean) : [];
  const diskUsed = diskParts[2] || "";
  const diskAvail = diskParts[3] || "";
  const diskUsePct = diskParts[4] || "";

  const tempMatch = temp.match(/=(\d+\.\d+)/);
  const temperature = tempMatch ? `${tempMatch[1]} C` : "";

  res.json({
    loadavg: loadavg.split(" ").slice(0, 3).join(" "),
    memTotal,
    memUsed,
    memFree,
    uptime: uptime.replace("up ", ""),
    diskUsed,
    diskAvail,
    diskUsePct,
    temperature,
  });
});

app.get("/api/logs", (_req, res) => {
  const logPath = path.join(__dirname, "data", "sample.log");
  let lines = [];
  try {
    const content = fs.readFileSync(logPath, "utf8");
    lines = content.split("\n").filter(Boolean);
  } catch {
    lines = ["Log file missing."];
  }
  const last = lines.slice(-200);
  res.json({
    lines: last,
  });
});

if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, { maxAge: 0 }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Wendor Toolkit server listening on port ${PORT}`);
});
```

### `server/data/sample.log`
```
[2026-03-29 10:00:01] boot: Wendor Toolkit starting
[2026-03-29 10:00:03] net: wlan0 up, dhcp acquired
[2026-03-29 10:00:05] usb: 1 device(s) connected
[2026-03-29 10:01:12] serial: /dev/ttyUSB0 opened (115200)
[2026-03-29 10:01:15] serial: handshake OK
[2026-03-29 10:02:07] tool: device detect scan complete
[2026-03-29 10:03:44] net: ping 1.1.1.1 OK
[2026-03-29 10:05:30] sys: temp 46.2 C
[2026-03-29 10:07:19] log: rotated
[2026-03-29 10:09:02] tool: placeholder action
```

### `client/package.json`
```json
{
  "name": "wendor-toolkit-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3000",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 3000"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2"
  }
}
```

### `client/vite.config.js`
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
```

### `client/index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <meta name="format-detection" content="telephone=no" />
    <title>Wendor Toolkit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### `client/src/main.jsx`
```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const root = createRoot(document.getElementById("root"));
root.render(<App />);
```

### `client/src/App.jsx`
```jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";

const SCREENS = {
  HOME: "home",
  MENU: "menu",
  DEVICES: "devices",
  NETWORK: "network",
  PERIPHERALS: "peripherals",
  IPCONFIG: "ipconfig",
  SERIAL: "serial",
  SYSTEM: "system",
  LOGS: "logs",
  TOOLS: "tools",
  SETTINGS: "settings",
};

async function fetchJson(url, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function Header({ title, onBack, right }) {
  return (
    <div className="header">
      {onBack ? (
        <button className="btn btn-back" onClick={onBack}>
          Back
        </button>
      ) : (
        <div className="header-spacer" />
      )}
      <div className="header-title">{title}</div>
      <div className="header-right">{right || null}</div>
    </div>
  );
}

function MenuButton({ label, onClick }) {
  return (
    <button className="btn btn-menu" onClick={onClick}>
      {label}
    </button>
  );
}

function ValueRow({ label, value }) {
  return (
    <div className="row">
      <div className="row-label">{label}</div>
      <div className="row-value">{value || "-"}</div>
    </div>
  );
}

function ListPanel({ title, items, emptyText }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div className="panel-scroll">
        {items && items.length ? (
          items.map((item, idx) => (
            <div className="panel-item" key={`${title}-${idx}`}>
              {item}
            </div>
          ))
        ) : (
          <div className="panel-empty">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [status, setStatus] = useState(null);
  const [network, setNetwork] = useState(null);
  const [devices, setDevices] = useState(null);
  const [serial, setSerial] = useState(null);
  const [system, setSystem] = useState(null);
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const go = useCallback((next) => setScreen(next), []);
  const backToMenu = useCallback(() => setScreen(SCREENS.MENU), []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchJson("/api/status", 900);
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  const loadNetwork = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/network", 1200);
      setNetwork(data);
    } catch {
      setError("Network query failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/devices", 1200);
      setDevices(data);
    } catch {
      setError("Device scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSerial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/serial", 1200);
      setSerial(data);
    } catch {
      setError("Serial scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSystem = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/system", 1200);
      setSystem(data);
    } catch {
      setError("System query failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/logs", 1200);
      setLogs(data);
    } catch {
      setError("Logs unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== SCREENS.HOME) return;
    loadStatus();
    const timer = setInterval(loadStatus, 5000);
    return () => clearInterval(timer);
  }, [screen, loadStatus]);

  useEffect(() => {
    setError("");
    setLoading(false);
  }, [screen]);

  useEffect(() => {
    if (screen === SCREENS.NETWORK) loadNetwork();
    if (screen === SCREENS.IPCONFIG) loadNetwork();
    if (screen === SCREENS.DEVICES) loadDevices();
    if (screen === SCREENS.SERIAL) loadSerial();
    if (screen === SCREENS.SYSTEM) loadSystem();
    if (screen === SCREENS.LOGS) loadLogs();
  }, [screen, loadNetwork, loadDevices, loadSerial, loadSystem, loadLogs]);

  const menuItems = useMemo(
    () => [
      { id: SCREENS.DEVICES, label: "Connected Devices" },
      { id: SCREENS.NETWORK, label: "WiFi / Network" },
      { id: SCREENS.PERIPHERALS, label: "Peripheral Devices" },
      { id: SCREENS.IPCONFIG, label: "IP Config" },
      { id: SCREENS.SERIAL, label: "Serial Ports" },
      { id: SCREENS.SYSTEM, label: "System Info" },
      { id: SCREENS.LOGS, label: "Logs" },
      { id: SCREENS.TOOLS, label: "Tools" },
      { id: SCREENS.SETTINGS, label: "Settings" },
    ],
    []
  );

  if (screen === SCREENS.HOME) {
    return (
      <div className="app">
        <Header title="Wendor Toolkit" />
        <div className="content">
          <div className="status-grid">
            <div className="status-card">
              <div className="status-label">IP</div>
              <div className="status-value">{status?.ip || "-"}</div>
            </div>
            <div className="status-card">
              <div className="status-label">WiFi</div>
              <div className="status-value">{status?.ssid || "-"}</div>
            </div>
            <div className="status-card">
              <div className="status-label">USB</div>
              <div className="status-value">{status?.usbCount ?? "-"}</div>
            </div>
            <div className="status-card">
              <div className="status-label">Serial</div>
              <div className="status-value">{status?.serialCount ?? "-"}</div>
            </div>
          </div>
          <div className="status-row">
            <div className="status-chip">Time {status?.timeLocal || "--:--:--"}</div>
            <div className={`status-chip ${status?.wifi === "connected" ? "ok" : "warn"}`}>
              WiFi {status?.wifi || "unknown"}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => go(SCREENS.MENU)}>
            Open Tools
          </button>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.MENU) {
    return (
      <div className="app">
        <Header title="Main Menu" onBack={() => go(SCREENS.HOME)} />
        <div className="content menu">
          {menuItems.map((item) => (
            <MenuButton key={item.id} label={item.label} onClick={() => go(item.id)} />
          ))}
        </div>
      </div>
    );
  }

  if (screen === SCREENS.DEVICES) {
    return (
      <div className="app">
        <Header
          title="Connected Devices"
          onBack={backToMenu}
          right={
            <button className="btn btn-small" onClick={loadDevices}>
              Refresh
            </button>
          }
        />
        <div className="content">
          {loading && <div className="hint">Refreshing...</div>}
          {error && <div className="hint warn">{error}</div>}
          <ListPanel
            title="USB Devices"
            items={devices?.usbDevices || []}
            emptyText="No USB devices"
          />
          <ListPanel
            title="TTY Devices"
            items={devices?.ttyDevices || []}
            emptyText="No TTY devices"
          />
          <div className="panel">
            <div className="panel-title">Mounted</div>
            <div className="panel-scroll">
              {devices?.mounted?.length ? (
                devices.mounted.map((m, idx) => (
                  <div className="panel-item" key={`mnt-${idx}`}>
                    {m.name} {m.size} {m.mountpoint}
                  </div>
                ))
              ) : (
                <div className="panel-empty">No mounted devices</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.NETWORK) {
    return (
      <div className="app">
        <Header
          title="WiFi / Network"
          onBack={backToMenu}
          right={
            <button className="btn btn-small" onClick={loadNetwork}>
              Refresh
            </button>
          }
        />
        <div className="content">
          {loading && <div className="hint">Refreshing...</div>}
          {error && <div className="hint warn">{error}</div>}
          <ValueRow label="SSID" value={network?.ssid} />
          <ValueRow label="Signal" value={network?.signal} />
          <ValueRow label="IP" value={network?.wlan0 || network?.eth0 || "-"} />
          <ValueRow label="Gateway" value={network?.gateway} />
          <ValueRow label="Internet" value={network?.internet} />
          <div className="panel">
            <div className="panel-title">Nearby WiFi</div>
            <div className="panel-scroll">
              {network?.nearby?.length ? (
                network.nearby.map((n, idx) => (
                  <div className="panel-item" key={`n-${idx}`}>
                    {n.ssid} {n.signal}
                  </div>
                ))
              ) : (
                <div className="panel-empty">No scan data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.PERIPHERALS) {
    return (
      <div className="app">
        <Header title="Peripheral Devices" onBack={backToMenu} />
        <div className="content">
          <div className="panel">
            <div className="panel-title">Serial / USB UART</div>
            <div className="panel-scroll">
              <div className="panel-item">USB UART adapters will appear here</div>
              <div className="panel-item">Camera/audio devices if present</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Notes</div>
            <div className="panel-scroll">
              <div className="panel-item">Detailed vendor/product info can be added later</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.IPCONFIG) {
    return (
      <div className="app">
        <Header
          title="IP Config"
          onBack={backToMenu}
          right={
            <button className="btn btn-small" onClick={loadNetwork}>
              Refresh
            </button>
          }
        />
        <div className="content">
          {loading && <div className="hint">Refreshing...</div>}
          {error && <div className="hint warn">{error}</div>}
          <ValueRow label="Hostname" value={network?.hostname} />
          <ValueRow label="wlan0 IP" value={network?.wlan0 || "-"} />
          <ValueRow label="eth0 IP" value={network?.eth0 || "-"} />
          <ValueRow label="wlan0 MAC" value={network?.macWlan || "-"} />
          <ValueRow label="eth0 MAC" value={network?.macEth || "-"} />
          <div className="panel">
            <div className="panel-title">Routes</div>
            <div className="panel-scroll">
              {network?.routes?.length ? (
                network.routes.map((r, idx) => (
                  <div className="panel-item" key={`rt-${idx}`}>
                    {r}
                  </div>
                ))
              ) : (
                <div className="panel-empty">No routing data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.SERIAL) {
    return (
      <div className="app">
        <Header
          title="Serial Ports"
          onBack={backToMenu}
          right={
            <button className="btn btn-small" onClick={loadSerial}>
              Refresh
            </button>
          }
        />
        <div className="content">
          {loading && <div className="hint">Refreshing...</div>}
          {error && <div className="hint warn">{error}</div>}
          <ListPanel title="Ports" items={serial?.ports || []} emptyText="No serial ports" />
          <div className="panel">
            <div className="panel-title">Baud Presets</div>
            <div className="panel-scroll">
              {(serial?.baudPresets || []).map((b) => (
                <div className="panel-item" key={b}>
                  {b}
                </div>
              ))}
            </div>
          </div>
          <div className="button-row">
            <button className="btn btn-secondary">Open Monitor</button>
            <button className="btn btn-secondary">Flash Device</button>
            <button className="btn btn-secondary">Capture Log</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.SYSTEM) {
    return (
      <div className="app">
        <Header
          title="System Info"
          onBack={backToMenu}
          right={
            <button className="btn btn-small" onClick={loadSystem}>
              Refresh
            </button>
          }
        />
        <div className="content">
          {loading && <div className="hint">Refreshing...</div>}
          {error && <div className="hint warn">{error}</div>}
          <ValueRow label="CPU Load" value={system?.loadavg} />
          <ValueRow label="Mem Used" value={system ? `${system.memUsed} / ${system.memTotal} MB` : "-"} />
          <ValueRow label="Mem Free" value={system?.memFree ? `${system.memFree} MB` : "-"} />
          <ValueRow label="Disk" value={system ? `${system.diskUsed} / ${system.diskAvail} (${system.diskUsePct})` : "-"} />
          <ValueRow label="Uptime" value={system?.uptime} />
          <ValueRow label="Temp" value={system?.temperature} />
        </div>
      </div>
    );
  }

  if (screen === SCREENS.LOGS) {
    return (
      <div className="app">
        <Header
          title="Logs"
          onBack={backToMenu}
          right={
            <button className="btn btn-small" onClick={loadLogs}>
              Refresh
            </button>
          }
        />
        <div className="content">
          {loading && <div className="hint">Refreshing...</div>}
          {error && <div className="hint warn">{error}</div>}
          <div className="panel log-panel">
            <div className="panel-title">Recent Logs</div>
            <div className="panel-scroll">
              {logs?.lines?.length ? (
                logs.lines.map((line, idx) => (
                  <div className="panel-item mono" key={`log-${idx}`}>
                    {line}
                  </div>
                ))
              ) : (
                <div className="panel-empty">No logs</div>
              )}
            </div>
          </div>
          <div className="button-row">
            <button className="btn btn-secondary">Clear</button>
            <button className="btn btn-secondary" onClick={loadLogs}>
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === SCREENS.TOOLS) {
    return (
      <div className="app">
        <Header title="Tools" onBack={backToMenu} />
        <div className="content menu">
          <MenuButton label="ESP32 Flash" onClick={() => {}} />
          <MenuButton label="Arduino CLI" onClick={() => {}} />
          <MenuButton label="Device Detect" onClick={() => {}} />
          <MenuButton label="Network Scan" onClick={() => {}} />
          <MenuButton label="Ping Test" onClick={() => {}} />
          <MenuButton label="Reboot Pi" onClick={() => {}} />
        </div>
      </div>
    );
  }

  if (screen === SCREENS.SETTINGS) {
    return (
      <div className="app">
        <Header title="Settings" onBack={backToMenu} />
        <div className="content">
          <ValueRow label="App Version" value="1.0.0" />
          <ValueRow label="Kiosk Mode" value="Enabled" />
          <div className="panel">
            <div className="panel-title">Controls</div>
            <div className="panel-scroll">
              <div className="panel-item">Restart App (placeholder)</div>
              <div className="panel-item">Reboot System (placeholder)</div>
              <div className="panel-item">Shutdown (placeholder)</div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Touch Calibration</div>
            <div className="panel-scroll">
              <div className="panel-item">Run calibration tool from console if needed</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

### `client/src/styles.css`
```css
:root {
  --bg: #0b0e12;
  --panel: #12161c;
  --panel-border: #1d2430;
  --text: #e6edf3;
  --muted: #95a2b3;
  --accent: #2dd4bf;
  --accent-2: #2563eb;
  --warn: #f59e0b;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html,
body {
  width: 480px;
  height: 320px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
  user-select: none;
}

#root {
  width: 480px;
  height: 320px;
}

.app {
  width: 480px;
  height: 320px;
  display: flex;
  flex-direction: column;
}

.header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--panel-border);
  background: #0f1319;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.header-spacer,
.header-right {
  width: 80px;
  display: flex;
  justify-content: flex-end;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  overflow: hidden;
}

.menu {
  overflow-y: auto;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.status-card {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 6px;
  height: 56px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.status-label {
  font-size: 11px;
  color: var(--muted);
}

.status-value {
  font-size: 16px;
  font-weight: 700;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-row {
  display: flex;
  gap: 6px;
}

.status-chip {
  flex: 1;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 6px;
  font-size: 12px;
  text-align: center;
}

.status-chip.ok {
  border-color: #14532d;
  color: #86efac;
}

.status-chip.warn {
  border-color: #7c2d12;
  color: #fdba74;
}

.btn {
  border: 1px solid var(--panel-border);
  background: #0f141b;
  color: var(--text);
  border-radius: 4px;
  height: 34px;
  padding: 0 10px;
  font-size: 14px;
  touch-action: manipulation;
}

.btn:active {
  background: #1b2430;
}

.btn-menu {
  height: 34px;
  text-align: left;
  font-size: 14px;
}

.btn-primary {
  height: 44px;
  background: var(--accent-2);
  border-color: #1e3a8a;
  font-weight: 700;
  font-size: 16px;
}

.btn-primary:active {
  background: #1d4ed8;
}

.btn-secondary {
  height: 34px;
  background: #121826;
}

.btn-small {
  height: 28px;
  font-size: 12px;
}

.btn-back {
  height: 28px;
  font-size: 12px;
}

.row {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--panel-border);
  padding: 4px 0;
  font-size: 13px;
}

.row-label {
  color: var(--muted);
}

.row-value {
  max-width: 260px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-title {
  font-size: 12px;
  color: var(--muted);
}

.panel-scroll {
  max-height: 64px;
  overflow-y: auto;
  padding-right: 4px;
  -webkit-overflow-scrolling: touch;
}

.panel-item {
  font-size: 12px;
  padding: 2px 0;
  border-bottom: 1px solid #151b24;
}

.panel-item:last-child {
  border-bottom: none;
}

.panel-empty {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 0;
}

.log-panel .panel-scroll {
  max-height: 150px;
}

.mono {
  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
}

.button-row {
  display: flex;
  gap: 6px;
}

.button-row .btn {
  flex: 1;
}

.hint {
  font-size: 12px;
  color: var(--muted);
}

.hint.warn {
  color: var(--warn);
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-thumb {
  background: #233044;
  border-radius: 3px;
}
```

## 4. PM2 Ecosystem Config
See `ecosystem.config.js` above.

## 5. Setup Commands
```bash
cd /home/zigg/zigg
npm run install:all
```

## 6. Build + Run Commands
### Development (two terminals)
```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:client
```

### Production
```bash
npm run build
npm run start
```

## 7. Raspberry Pi Boot Auto-start Steps (PM2)
```bash
# From /home/zigg/zigg
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
Follow the `pm2 startup` output instructions (it prints the command to enable boot autostart).

## 8. Chromium Kiosk Command
```bash
chromium-browser \
  --kiosk \
  --app=http://localhost:3000 \
  --window-size=480,320 \
  --window-position=0,0 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=TranslateUI \
  --incognito
```

## 9. Performance Optimization Notes for Laggy SPI TFT Screens
**In-app optimizations (already done):**
1. Fixed 480x320 layout to avoid responsive reflow.
2. Minimal DOM depth and no heavy libraries.
3. No animations or shadows; no GPU-heavy CSS.
4. Touch-first buttons with `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent`.
5. Polling only where needed (Home screen every 5s).
6. Simple, fast list rendering and contained scroll areas.
7. Lightweight API calls with timeouts to avoid stalls.

**System / Chromium tuning suggestions:**
1. Disable screen blanking/power management to prevent wake lag.
2. Use `--app` + `--kiosk` to reduce browser chrome overhead.
3. Avoid GPU-heavy compositing; keep a simple UI like this one.
4. If input lag persists, consider:
   - Lowering SPI refresh rate or re-checking overlay settings.
   - Ensuring the touch driver is using the correct input mode.
   - Calibrating touchscreen with `xinput` or `tslib` if used.
5. Minimize background services; disable unneeded daemons.
6. Consider `--disable-features=CalculateNativeWinOcclusion` if display issues occur.

## 10. Future Expansion Ideas
1. ESP32 flashing via `esptool.py` integration.
2. Serial monitor with selectable baud and live log capture.
3. Arduino CLI for board detection and sketch upload.
4. Network scan tool with `nmap` or `arp-scan` integration.
5. Automated device fingerprinting and USB VID/PID lookup.
6. Hardware test scripts (GPIO, I2C, SPI diagnostics).

## Production Architecture Notes
- **Dev:** Vite on `http://localhost:3000`, API on `http://localhost:3001` via proxy.
- **Prod:** Build frontend, Express serves `/client/dist` + API on `http://localhost:3000`.
- **PM2:** One process in production (Express only).

## Kiosk Autostart with `.xinitrc`
Create or edit `~/.xinitrc`:
```sh
#!/bin/sh
xset -dpms
xset s off
xset s noblank

# optional: hide mouse cursor
unclutter -idle 0.1 -root &

# start app server (if not already handled by PM2)
# pm2 resurrect

chromium-browser \
  --kiosk \
  --app=http://localhost:3000 \
  --window-size=480,320 \
  --window-position=0,0 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=TranslateUI \
  --incognito
```

## Notes
- If `nmcli` or `iw` are not installed, WiFi scanning falls back gracefully.
- Some data (temperature, WiFi signal) may be blank depending on system configuration.
