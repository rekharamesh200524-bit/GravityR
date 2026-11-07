import { useTerminalStore } from '../stores/useTerminalStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';

export interface BackendTerminalSession {
  session_id: string;
  shell_type: string;
  working_directory: string;
  created_at: string;
  last_activity: string;
  status: string;
  pid: number;
}

export interface TerminalConnectionHandle {
  socket: WebSocket | null;
  sendInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
}

export class TerminalService {
  // Direct sockets registered by TerminalTabItem components
  private directSockets: Map<string, WebSocket> = new Map();
  // Legacy connection handles (kept for backward compat)
  private activeConnections: Map<string, TerminalConnectionHandle> = new Map();
  private legacySubscribers: Set<(data: string) => void> = new Set();

  private get apiBase() {
    if (typeof window === 'undefined') return 'http://localhost:8000/api';
    const host = window.location.hostname || 'localhost';
    return `http://${host}:8000/api`;
  }

  private get wsBase() {
    if (typeof window === 'undefined') return 'ws://localhost:8000';
    const host = window.location.hostname || 'localhost';
    return `ws://${host}:8000`;
  }

  /**
   * Register a WebSocket socket managed directly by a TerminalTabItem.
   */
  public registerDirectSocket(sessionId: string, socket: WebSocket): void {
    this.directSockets.set(sessionId, socket);
    console.log(`[TERMINAL SERVICE] Registered direct socket for session ${sessionId}. Total: ${this.directSockets.size}`);
  }

  /**
   * Unregister a direct socket when TerminalTabItem unmounts.
   */
  public unregisterDirectSocket(sessionId: string): void {
    this.directSockets.delete(sessionId);
    console.log(`[TERMINAL SERVICE] Unregistered direct socket for session ${sessionId}. Total: ${this.directSockets.size}`);
  }

  /**
   * Spawns a new isolated terminal session on the backend.
   */
  public async createBackendSession(shellType: string = 'powershell', cwd?: string): Promise<BackendTerminalSession> {
    const activeProject = useWorkspaceStore.getState().currentProject;
    const targetCwd = cwd || activeProject?.path || '';

    console.log(`[TERMINAL DEBUG] Creating terminal session`);
    console.log(`[TERMINAL DEBUG] workspace_id=${activeProject?.id || 'none'}`);
    console.log(`[TERMINAL DEBUG] cwd=${targetCwd || 'default'}`);

    const response = await fetch(`${this.apiBase}/terminal/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shell_type: shellType,
        cwd: targetCwd || undefined,
        workspace_id: activeProject?.id,
        cols: 80,
        rows: 24,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create terminal session: HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`[TERMINAL DEBUG] Session created: ${data.session_id}`);
    return data;
  }

  /**
   * Closes a backend terminal session by session_id.
   */
  public async closeBackendSession(sessionId: string): Promise<boolean> {
    console.log(`[TERMINAL SERVICE] Closing backend session: ${sessionId}`);
    try {
      // Close direct socket if registered
      const socket = this.directSockets.get(sessionId);
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close(1000, 'Session closed by user');
      }
      this.directSockets.delete(sessionId);

      // Also close legacy handle if any
      const handle = this.activeConnections.get(sessionId);
      if (handle) {
        handle.close();
        this.activeConnections.delete(sessionId);
      }

      const response = await fetch(`${this.apiBase}/terminal/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch (err) {
      console.error(`Error closing session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Legacy: connect WebSocket (kept for backward compat but NOT used by TerminalTabItem directly).
   */
  public connectWebSocket(
    sessionId: string,
    onData: (data: string) => void,
    onOpen?: () => void,
    onClose?: () => void
  ): TerminalConnectionHandle {
    // Close any stale connection for this session
    const existingHandle = this.activeConnections.get(sessionId);
    if (existingHandle) {
      existingHandle.close();
      this.activeConnections.delete(sessionId);
    }

    const wsUrl = `${this.wsBase}/ws/terminal/${sessionId}`;
    console.log(`[WS DIAGNOSTIC] CONNECTING - Session: ${sessionId}, URL: ${wsUrl}`);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log(`[WS DIAGNOSTIC] OPEN - Session: ${sessionId}`);
      if (onOpen) onOpen();
    };

    socket.onmessage = (event) => {
      onData(event.data);
      this.legacySubscribers.forEach((sub) => sub(event.data));
    };

    socket.onclose = (event: CloseEvent) => {
      console.log(`[WS DIAGNOSTIC] CLOSE - Session: ${sessionId}, code: ${event.code}, wasClean: ${event.wasClean}`);
      this.activeConnections.delete(sessionId);
      if (onClose) onClose();
    };

    socket.onerror = (event: Event) => {
      const target = event.target as WebSocket;
      console.error(`[WS DIAGNOSTIC] ERROR - Session: ${sessionId}, readyState: ${target?.readyState ?? socket.readyState}`);
      onData('\r\n\x1b[31mTerminal connection error.\x1b[0m\r\n');
    };

    const sendInput = (data: string) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      } else {
        console.warn(`[TERMINAL] Cannot send - socket not OPEN (state=${socket.readyState})`);
      }
    };

    const resize = (cols: number, rows: number) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    };

    const close = () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Explicit client close');
      }
      this.activeConnections.delete(sessionId);
    };

    const handle: TerminalConnectionHandle = { socket, sendInput, resize, close };
    this.activeConnections.set(sessionId, handle);
    return handle;
  }

  /**
   * Sends input to the active terminal session (multi-tab routing).
   */
  public handleInput(data: string) {
    const activeTabId = useTerminalStore.getState().activeTabId;

    // Try direct socket first
    if (activeTabId) {
      const socket = this.directSockets.get(activeTabId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
        return;
      }
    }

    // Fallback to legacy handles
    if (activeTabId && this.activeConnections.has(activeTabId)) {
      this.activeConnections.get(activeTabId)?.sendInput(data);
    }
  }

  /**
   * Resizes the active terminal session.
   */
  public resize(cols: number, rows: number) {
    const activeTabId = useTerminalStore.getState().activeTabId;
    if (activeTabId) {
      const socket = this.directSockets.get(activeTabId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols, rows }));
        return;
      }
    }
    if (activeTabId && this.activeConnections.has(activeTabId)) {
      this.activeConnections.get(activeTabId)?.resize(cols, rows);
    }
  }

  /**
   * Subscribes to terminal output stream (legacy support).
   */
  public subscribe(callback: (data: string) => void) {
    this.legacySubscribers.add(callback);
  }

  public disconnect() {
    console.log('[TERMINAL SERVICE] Disconnecting all sessions...');
    this.directSockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Service disconnect');
      }
    });
    this.directSockets.clear();
    this.activeConnections.forEach((handle) => handle.close());
    this.activeConnections.clear();
  }
}

export const terminalService = new TerminalService();
