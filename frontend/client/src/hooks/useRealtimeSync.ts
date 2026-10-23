import { useEffect, useRef, useState, useCallback } from "react";

// ===========================================================================
// useRealtimeSync — WebSocket hook for multi-operator collaboration (v15)
//
// Connects to /api/realtime/ws?projectId=... and receives broadcast events
// from other operators (arm, disarm, command, alert, operator_joined, etc.)
//
// Returns:
//   - connected: boolean
//   - events: array of received events (last 100)
//   - operators: array of currently online operators
//   - sendPing: () => void (keepalive)
// ===========================================================================

export type RealtimeEvent = {
  type: string;
  projectId: string | null;
  actorId: string;
  actorEmail: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
};

export type OnlineOperator = {
  userId: string;
  userEmail: string;
  connectedAt: string;
};

export function useRealtimeSync(projectId: string | null) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [operators, setOperators] = useState<OnlineOperator[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (!projectId) return;
    let stopped = false;
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/realtime/ws?projectId=${encodeURIComponent(projectId)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!stopped) {
          setConnected(true);
          // Start keepalive ping every 30s
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send("ping");
            }
          }, 30000);
        }
      };

      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "presence") {
            setOperators(Array.isArray(data.operators) ? data.operators : []);
          } else if (data.type === "pong") {
            // keepalive response
          } else {
            // Real event
            setEvents((prev) => [...prev.slice(-99), data as RealtimeEvent]);
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        if (!stopped) {
          setConnected(false);
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          // Auto-reconnect after 3s
          setTimeout(() => {
            if (!stopped) connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        // onclose will handle reconnect
      };
    } catch {
      // WebSocket not available
    }

    return () => {
      stopped = true;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [projectId]);

  useEffect(() => {
    return connect();
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { connected, events, operators, clearEvents };
}
