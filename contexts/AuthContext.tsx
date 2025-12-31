/**
 * Authentication Context
 *
 * Manages connection state to CLIProxy Management API.
 * Provides connection status, server version, and authentication methods.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { managementApi } from '../lib/management-api';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface AuthState {
  isConnected: boolean;
  serverVersion: string | null;
  connectionStatus: ConnectionStatus;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  checkConnection: () => Promise<void>;
  disconnect: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isConnected: false,
    serverVersion: null,
    connectionStatus: 'connecting',
    error: null
  });

  const checkConnection = async () => {
    setState(prev => ({ ...prev, connectionStatus: 'connecting', error: null }));

    try {
      // Try to fetch config to verify connection
      const config = await managementApi.getConfig();

      setState({
        isConnected: true,
        serverVersion: null, // Could extract from response headers
        connectionStatus: 'connected',
        error: null
      });
    } catch (error) {
      console.error('[AuthContext] Connection check failed:', error);

      setState({
        isConnected: false,
        serverVersion: null,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  };

  const disconnect = () => {
    setState({
      isConnected: false,
      serverVersion: null,
      connectionStatus: 'disconnected',
      error: null
    });
  };

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const value: AuthContextValue = {
    ...state,
    checkConnection,
    disconnect
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
