/**
 * React hook for using Snaffler in your Electron app
 * Example usage in your React components
 */

import { useState, useEffect, useCallback } from 'react';
import { SnafflerConfig, FileResult, ScanStatus } from '../core/types';

export interface UseSnafflerReturn {
  // State
  isScanning: boolean;
  status: ScanStatus | null;
  results: FileResult[];
  errors: string[];
  logs: Array<{ level: string; message: string; timestamp: Date }>;

  // Actions
  startScan: (config: Partial<SnafflerConfig>) => Promise<boolean>;
  stopScan: () => Promise<void>;
  clearResults: () => void;
  clearLogs: () => void;

  // Config helpers
  validateConfig: (config: Partial<SnafflerConfig>) => Promise<{ valid: boolean; errors: string[] }>;
  loadConfig: (filePath: string) => Promise<SnafflerConfig | null>;
  saveConfig: (filePath: string, config: Partial<SnafflerConfig>) => Promise<boolean>;
}

export function useSnaffler(): UseSnafflerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [logs, setLogs] = useState<Array<{ level: string; message: string; timestamp: Date }>>([]);

  // Set up event listeners
  useEffect(() => {
    if (!window.snaffler) {
      console.error('Snaffler API not available. Make sure preload script is loaded.');
      return;
    }

    // File result handler
    const unsubFileResult = window.snaffler.onFileResult((result) => {
      setResults((prev) => [...prev, result]);
    });

    // Status update handler
    const unsubStatus = window.snaffler.onStatusUpdate((newStatus) => {
      setStatus(newStatus);
      setIsScanning(newStatus.isRunning);
    });

    // Error handler
    const unsubError = window.snaffler.onError((error) => {
      setErrors((prev) => [...prev, error]);
    });

    // Complete handler
    const unsubComplete = window.snaffler.onComplete(() => {
      setIsScanning(false);
    });

    // Log handler
    const unsubLog = window.snaffler.onLog((log) => {
      setLogs((prev) => [...prev, { ...log, timestamp: new Date() }]);
    });

    // Cleanup
    return () => {
      unsubFileResult();
      unsubStatus();
      unsubError();
      unsubComplete();
      unsubLog();
    };
  }, []);

  // Start scan
  const startScan = useCallback(async (config: Partial<SnafflerConfig>): Promise<boolean> => {
    if (!window.snaffler) return false;

    // Clear previous results
    setResults([]);
    setErrors([]);
    setLogs([]);

    const result = await window.snaffler.start(config);

    if (!result.success) {
      setErrors(result.errors || ['Unknown error']);
      return false;
    }

    setIsScanning(true);
    return true;
  }, []);

  // Stop scan
  const stopScan = useCallback(async () => {
    if (!window.snaffler) return;

    await window.snaffler.stop();
    setIsScanning(false);
  }, []);

  // Clear results
  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Validate config
  const validateConfig = useCallback(async (config: Partial<SnafflerConfig>) => {
    if (!window.snaffler) {
      return { valid: false, errors: ['Snaffler API not available'] };
    }

    return window.snaffler.validateConfig(config);
  }, []);

  // Load config from file
  const loadConfig = useCallback(async (filePath: string): Promise<SnafflerConfig | null> => {
    if (!window.snaffler) return null;

    const result = await window.snaffler.loadConfig(filePath);

    if (!result.success) {
      setErrors((prev) => [...prev, result.error || 'Failed to load config']);
      return null;
    }

    return result.config || null;
  }, []);

  // Save config to file
  const saveConfig = useCallback(async (filePath: string, config: Partial<SnafflerConfig>): Promise<boolean> => {
    if (!window.snaffler) return false;

    const result = await window.snaffler.saveConfig(filePath, config);

    if (!result.success) {
      setErrors((prev) => [...prev, result.error || 'Failed to save config']);
      return false;
    }

    return true;
  }, []);

  return {
    isScanning,
    status,
    results,
    errors,
    logs,
    startScan,
    stopScan,
    clearResults,
    clearLogs,
    validateConfig,
    loadConfig,
    saveConfig,
  };
}

/**
 * Example React component using the hook
 */
export function SnafflerComponent() {
  const {
    isScanning,
    status,
    results,
    errors,
    startScan,
    stopScan,
    clearResults,
  } = useSnaffler();

  const handleStartScan = async () => {
    const config: Partial<SnafflerConfig> = {
      pathTargets: ['\\\\SERVER\\Share'],
      shareFinderEnabled: true,
      logLevel: 'info',
    };

    await startScan(config);
  };

  return (
    <div>
      <h1>Snaffler Scanner</h1>

      <div>
        <button onClick={handleStartScan} disabled={isScanning}>
          Start Scan
        </button>
        <button onClick={stopScan} disabled={!isScanning}>
          Stop Scan
        </button>
        <button onClick={clearResults}>Clear Results</button>
      </div>

      {status && (
        <div>
          <h2>Status</h2>
          <p>Files Scanned: {status.filesScanned}</p>
          <p>Results Found: {status.resultsFound}</p>
          <p>Errors: {status.errors}</p>
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <h2>Errors</h2>
          <ul>
            {errors.map((error, i) => (
              <li key={i} style={{ color: 'red' }}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2>Results ({results.length})</h2>
        <ul>
          {results.map((result, i) => (
            <li key={i}>
              <strong>{result.fileName}</strong> - {result.triage}
              <br />
              <small>{result.filePath}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
