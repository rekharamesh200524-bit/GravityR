'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalService } from '../../services/terminalService';
import { TerminalTab, useTerminalStore } from '../../stores/useTerminalStore';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabItemProps {
  tab: TerminalTab;
  isActive: boolean;
}

export const TerminalTabItem: React.FC<TerminalTabItemProps> = ({ tab, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log(`[TERMINAL] Mounting terminal for session ${tab.sessionId}`);

    const term = new XtermTerminal({
      theme: {
        background: '#04060a',
        foreground: '#e2e8f0',
        cursor: '#8b5cf6',
        selectionBackground: 'rgba(139,92,246,0.35)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#cbd5e1',
      },
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", var(--font-geist-mono), monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
      windowsPty: { backend: 'conpty' },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleThemeChange = (e: any) => {
      if (e.detail?.theme?.xtermTheme && xtermRef.current) {
        xtermRef.current.options.theme = e.detail.theme.xtermTheme;
      }
    };
    window.addEventListener('theme-changed', handleThemeChange);

    // Custom keybindings matching native Windows Terminal / VS Code terminal
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // Ctrl+C with selection -> copy instead of sending SIGINT; without selection -> send SIGINT (\x03)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        if (term.hasSelection()) {
          const selected = term.getSelection();
          if (selected && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(selected).catch(() => {});
          }
          term.clearSelection();
          return false;
        }
        return true;
      }

      // Ctrl+Shift+C -> always copy
      if (isCtrlOrMeta && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        if (term.hasSelection() && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        }
        return false;
      }

      // Ctrl+Shift+V -> paste via Clipboard API
      if (isCtrlOrMeta && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') {
        if (navigator.clipboard?.readText) {
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text && socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(text);
              }
            })
            .catch(() => {});
        }
        return false;
      }

      return true;
    });

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        term.focus();
      } catch (e) {
        console.warn(`[TERMINAL] fitAddon.fit() error:`, e);
      }
    });

    let isUnmounted = false;
    let isRespawning = false;
    let connectTimeout: NodeJS.Timeout | null = null;

    const respawnSession = async () => {
      if (isUnmounted || isRespawning) return;
      isRespawning = true;
      try {
        const activeProjectPath = useWorkspaceStore.getState().currentProject?.path;
        const targetCwd = tab.cwd || activeProjectPath || undefined;
        const newSession = await terminalService.createBackendSession(tab.shellType || 'powershell', targetCwd);
        if (!isUnmounted) {
          useTerminalStore.getState().updateTabSession(tab.id, newSession.session_id, newSession.working_directory);
        }
      } catch (err) {
        if (!isUnmounted) {
          term.writeln('\r\n\x1b[31m[Unable to connect to terminal backend. Check that backend server is running.]\x1b[0m');
        }
      } finally {
        isRespawning = false;
      }
    };

    const connectWebSocket = (attempt = 1) => {
      if (isUnmounted) return;
      const rawHost = typeof window !== 'undefined' ? window.location.hostname || '127.0.0.1' : '127.0.0.1';
      const wsHost = rawHost === 'localhost' ? '127.0.0.1' : rawHost;
      const wsUrl = `ws://${wsHost}:8000/ws/terminal/${tab.sessionId}`;
      console.log(`[TERMINAL DEBUG] Connecting WebSocket (attempt ${attempt}): ${wsUrl}`);

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log(`[TERMINAL DEBUG] WebSocket opened`);
        terminalService.registerDirectSocket(tab.sessionId, socket);
        try {
          fitAddon.fit();
          if (term.cols > 0 && term.rows > 0) {
            socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        } catch {
          // Ignore fit errors during mount
        }
        term.focus();
      };

      socket.onmessage = (event: MessageEvent) => {
        term.write(event.data);
      };

      socket.onclose = (event: CloseEvent) => {
        console.log(`[TERMINAL DEBUG] WebSocket close code=${event.code}`);
        terminalService.unregisterDirectSocket(tab.sessionId);
        if (isUnmounted) return;

        if (event.code === 1008) {
          // Backend restarted or session expired -> seamlessly spawn a fresh shell session
          if (attempt < 2) {
            connectTimeout = setTimeout(() => connectWebSocket(attempt + 1), 300);
          } else {
            term.writeln('\r\n\x1b[33m[Reconnecting terminal session...]\x1b[0m');
            respawnSession();
          }
        } else if (!event.wasClean) {
          term.writeln('\r\n\x1b[31m[Terminal disconnected — press Enter to restart]\x1b[0m');
        }
      };

      socket.onerror = () => {
        // Handled cleanly in onclose
      };
    };

    connectWebSocket(1);

    // Send keyboard input directly over WebSocket (or respawn on Enter if disconnected)
    const dataDisposable = term.onData((data) => {
      const sock = socketRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(data);
      } else if (sock && sock.readyState === WebSocket.CLOSED && (data === '\r' || data === '\n')) {
        respawnSession();
      }
    });

    // Send resize events to PTY
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      const sock = socketRef.current;
      if (sock && sock.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
        sock.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Fit terminal automatically when container resizes
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (containerRef.current && containerRef.current.offsetParent !== null) {
          fitAddon.fit();
        }
      } catch {
        // Suppress fit errors when hidden
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      isUnmounted = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      console.log(`[TERMINAL] Unmounting — closing socket for session ${tab.sessionId}`);
      window.removeEventListener('theme-changed', handleThemeChange);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      terminalService.unregisterDirectSocket(tab.sessionId);
      const sock = socketRef.current;
      if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) {
        sock.close(1000, 'Terminal component unmounted');
      }
      socketRef.current = null;
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tab.sessionId]);

  // Re-fit, sync PTY dimensions, and focus when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && xtermRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          const term = xtermRef.current;
          const sock = socketRef.current;
          if (term && sock && sock.readyState === WebSocket.OPEN && term.cols > 0 && term.rows > 0) {
            sock.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
          term?.focus();
        } catch {
          // Ignored
        }
      });
    }
  }, [isActive]);

  const handleContainerClick = () => {
    xtermRef.current?.focus();
  };

  // Classic PowerShell / Windows Terminal right-click: copy selection, or paste if nothing selected
  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const term = xtermRef.current;
    if (!term) return;

    if (term.hasSelection()) {
      const selected = term.getSelection();
      if (selected && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selected).catch(() => {});
      }
      term.clearSelection();
    } else if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(text);
        }
      } catch {
        // Clipboard permission denied
      }
    }
    term.focus();
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onClick={handleContainerClick}
      onContextMenu={handleContextMenu}
      className={`absolute inset-0 p-2 font-mono cursor-text outline-none select-text ${isActive ? 'block' : 'hidden'}`}
    />
  );
};

export default TerminalTabItem;
