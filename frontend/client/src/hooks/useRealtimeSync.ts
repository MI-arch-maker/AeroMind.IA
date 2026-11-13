import { useCallback, useEffect, useState } from "react";

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

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const STABLE_CONNECTION_RESET_MS = 30_000;

/** WebSocket collaboration channel with cancellable reconnect and heartbeat. */
export function useRealtimeSync(projectId: string | null) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [operators, setOperators] = useState<OnlineOperator[]>([]);

  useEffect(() => {
    setConnected(false);
    setEvents([]);
    setOperators([]);
    if (!projectId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let lastPongAt = 0;

    const clearHeartbeat = () => {
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) return;
      setConnected(false);
      clearHeartbeat();
      if (stableConnectionTimer !== null) {
        clearTimeout(stableConnectionTimer);
        stableConnectionTimer = null;
      }
      const delay = Math.min(1_000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url = `${protocol}//${window.location.host}/api/realtime/ws?projectId=${encodeURIComponent(projectId)}`;
        const nextSocket = new WebSocket(url);
        socket = nextSocket;

        nextSocket.onopen = () => {
          if (cancelled || socket !== nextSocket) {
            nextSocket.close();
            return;
          }
          lastPongAt = Date.now();
          setConnected(true);
          stableConnectionTimer = setTimeout(() => {
            reconnectAttempt = 0;
            stableConnectionTimer = null;
          }, STABLE_CONNECTION_RESET_MS);
          clearHeartbeat();
          heartbeatTimer = setInterval(() => {
            if (cancelled || socket !== nextSocket) return;
            if (nextSocket.readyState !== WebSocket.OPEN) return;
            if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
              nextSocket.close();
              return;
            }
            try {
              nextSocket.send("ping");
            } catch {
              nextSocket.close();
            }
          }, HEARTBEAT_INTERVAL_MS);
        };

        nextSocket.onmessage = (message) => {
          if (cancelled || socket !== nextSocket) return;
          if (message.data === "pong") {
            lastPongAt = Date.now();
            return;
          }
          try {
            const data = JSON.parse(String(message.data)) as Record<string, unknown>;
            if (data.type === "pong") {
              lastPongAt = Date.now();
            } else if (data.type === "presence") {
              setOperators(Array.isArray(data.operators) ? data.operators as OnlineOperator[] : []);
            } else if (typeof data.type === "string") {
              setEvents((previous) => [...previous.slice(-99), data as unknown as RealtimeEvent]);
            }
          } catch {
            // Malformed or unrelated frames do not poison the live channel.
          }
        };

        nextSocket.onerror = () => {
          // Some browsers do not emit close promptly after error.
          nextSocket.close();
        };
        nextSocket.onclose = () => {
          if (socket === nextSocket) socket = null;
          if (!cancelled) scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (stableConnectionTimer !== null) clearTimeout(stableConnectionTimer);
      clearHeartbeat();
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      setConnected(false);
    };
  }, [projectId]);

  const clearEvents = useCallback(() => setEvents([]), []);
  return { connected, events, operators, clearEvents };
}
