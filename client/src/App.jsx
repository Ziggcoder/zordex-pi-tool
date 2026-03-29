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
        <Header title="Zordex Pi Tool" />
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
