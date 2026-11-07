'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalService } from '../../services/terminalService';
import { TerminalTab } from '../../stores/useTerminalStore';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabItemProps {
  tab: TerminalTab;
  isActive: boolean;
}

export const TerminalTabItem: React.FC<TerminalTabItemProps> = ({ tab, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log(`[TERMINAL] Mounting terminal for session ${tab.sessionId}`);

    // Create Xterm terminal instance
    const term = new XtermTerminal({
      theme: {
        background: '#04060a',
        foreground: '#e2e8f0',
        cursor: '#8b5cf6',
        selectionBackground: 'rgba(139,92,246,0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#cbd5e1',
      },
      fontFamily: 'var(--font-geist-mono), monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Apply active theme if present
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme?.xtermTheme && xtermRef.current) {
        xtermRef.current.options.theme = e.detail.theme.xtermTheme;
      }
    };
    window.addEventListener('theme-changed', handleThemeChange);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        term.focus();
      } catch (e) {
        console.warn(`[TERMINAL] fitAddon.fit() error:`, e);
      }
    });

    // Create a FRESH WebSocket directly — no reuse guard, no stale callbacks
    const wsHost = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    const wsUrl = `ws://${wsHost}:8000/ws/terminal/${tab.sessionId}`;
    console.log(`[TERMINAL] Connecting WebSocket: ${wsUrl}`);

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log(`[TERMINAL] WebSocket OPEN for session ${tab.sessionId}`);
      term.focus();
    };

    socket.onmessage = (event: MessageEvent) => {
      console.log(`[TERMINAL] socket.onmessage: ${event.data.length} bytes`);
      term.write(event.data);
    };

    socket.onclose = (event: CloseEvent) => {
      console.log(`[TERMINAL] WebSocket CLOSED: code=${event.code}, reason="${event.reason}", wasClean=${event.wasClean}`);
      if (!event.wasClean) {
        term.writeln('\r\n\x1b[31m[Terminal connection closed]\x1b[0m');
      }
    };

    socket.onerror = (event: Event) => {
      console.error(`[TERMINAL] WebSocket ERROR for session ${tab.sessionId}:`, event);
      term.writeln('\r\n\x1b[31m[Terminal connection error]\x1b[0m');
    };

    // Register keyboard input → send over WebSocket
    term.onData((data) => {
      console.log(`[TERMINAL] onData: readyState=${socket.readyState}, data=${JSON.stringify(data)}`);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      } else {
        console.warn(`[TERMINAL] Cannot send — WebSocket not OPEN (state=${socket.readyState})`);
      }
    });

    // Send resize events
    term.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Also register with terminalService for multi-tab routing
    terminalService.registerDirectSocket(tab.sessionId, socket);

    // Fit on container resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (containerRef.current && containerRef.current.offsetParent !== null) {
          fitAddon.fit();
        }
      } catch (err) {
        // Suppress fit errors when hidden
      }
    });
    resizeObserver.observe(containerRef.current);

    // Cleanup: close socket and dispose terminal when component unmounts
    return () => {
      console.log(`[TERMINAL] Unmounting — closing socket for session ${tab.sessionId}`);
      window.removeEventListener('theme-changed', handleThemeChange);
      resizeObserver.disconnect();
      terminalService.unregisterDirectSocket(tab.sessionId);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Terminal component unmounted');
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tab.sessionId]);

  // When switching to this active tab, re-fit and focus
  useEffect(() => {
    if (isActive && fitAddonRef.current && xtermRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          xtermRef.current?.focus();
        } catch (e) {
          // Ignored
        }
      });
    }
  }, [isActive]);

  const handleContainerClick = () => {
    xtermRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onClick={handleContainerClick}
      className={`absolute inset-0 p-2 font-mono cursor-text outline-none ${isActive ? 'block' : 'hidden'}`}
    />
  );
};

export default TerminalTabItem;
