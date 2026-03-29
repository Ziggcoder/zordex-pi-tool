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
