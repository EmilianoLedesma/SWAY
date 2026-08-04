import { createContext, useContext, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { API_HOST } from '../api/client';
import { useAuth } from './AuthContext';

const TOKEN_KEY = 'sway_colab_token';
const RealtimeContext = createContext({ subscribe: () => () => {} });

function wsUrl() {
  return API_HOST.replace(/^http/, 'ws') + '/api/ws';
}

export function RealtimeProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const listenersRef = useRef(new Set());
  const socketRef = useRef(null);
  const hasConnectedBeforeRef = useRef(false);
  const retryDelayRef = useRef(1000);
  const closedByUsRef = useRef(false);
  const reconnectTimerRef = useRef(null);

  const notify = (message) => {
    listenersRef.current.forEach((cb) => cb(message));
  };

  useEffect(() => {
    if (!isLoggedIn) {
      closedByUsRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      hasConnectedBeforeRef.current = false;
      retryDelayRef.current = 1000;
      return;
    }

    closedByUsRef.current = false;

    const connect = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token || closedByUsRef.current) return;

      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
        retryDelayRef.current = 1000;
        if (hasConnectedBeforeRef.current) {
          notify({ type: 'resync' });
        }
        hasConnectedBeforeRef.current = true;
      };

      socket.onmessage = (event) => {
        try {
          notify(JSON.parse(event.data));
        } catch {
          // ignore malformed message
        }
      };

      socket.onclose = () => {
        if (closedByUsRef.current) return;
        reconnectTimerRef.current = setTimeout(connect, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [isLoggedIn]);

  const subscribe = (callback) => {
    listenersRef.current.add(callback);
    return () => listenersRef.current.delete(callback);
  };

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
