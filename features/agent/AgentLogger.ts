import type { AgentLogEntry, LogLevel } from './types';

// ─── In-memory agent logger ───────────────────────────────────
class AgentLogger {
  private logs: AgentLogEntry[] = [];
  private maxLogs = 500;
  private listeners: ((entry: AgentLogEntry) => void)[] = [];

  private emit(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): AgentLogEntry {
    const entry: AgentLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      level,
      module,
      message,
      data,
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    for (const fn of this.listeners) fn(entry);
    return entry;
  }

  debug(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('debug', module, message, data);
  }

  info(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('info', module, message, data);
  }

  warn(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('warn', module, message, data);
  }

  error(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('error', module, message, data);
  }

  getLogs(): AgentLogEntry[] {
    return [...this.logs];
  }

  getLogsByModule(module: string): AgentLogEntry[] {
    return this.logs.filter((l) => l.module === module);
  }

  clear(): void {
    this.logs = [];
  }

  onLog(fn: (entry: AgentLogEntry) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

// Singleton export
export const agentLogger = new AgentLogger();
