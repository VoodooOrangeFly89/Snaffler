/**
 * Electron preload script for Snaffler
 * Exposes safe IPC methods to renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import { SnafflerConfig, FileResult, ScanStatus } from '../core/types';

// Define the API interface
export interface SnafflerAPI {
  // Start a scan
  start: (config: Partial<SnafflerConfig>) => Promise<{ success: boolean; errors?: string[] }>;

  // Stop the current scan
  stop: () => Promise<{ success: boolean; error?: string }>;

  // Get current scan status
  getStatus: () => Promise<ScanStatus | null>;

  // Validate configuration
  validateConfig: (config: Partial<SnafflerConfig>) => Promise<{ valid: boolean; errors: string[] }>;

  // Load configuration from file
  loadConfig: (filePath: string) => Promise<{ success: boolean; config?: SnafflerConfig; error?: string }>;

  // Save configuration to file
  saveConfig: (filePath: string, config: Partial<SnafflerConfig>) => Promise<{ success: boolean; error?: string }>;

  // Generate example configuration
  generateExampleConfig: (outputPath: string) => Promise<{ success: boolean; error?: string }>;

  // Event listeners
  onFileResult: (callback: (result: FileResult) => void) => () => void;
  onStatusUpdate: (callback: (status: ScanStatus) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
  onComplete: (callback: () => void) => () => void;
  onLog: (callback: (log: { level: string; message: string }) => void) => () => void;
}

// Expose protected API to renderer
const snafflerAPI: SnafflerAPI = {
  start: (config) => ipcRenderer.invoke('snaffler:start', config),
  stop: () => ipcRenderer.invoke('snaffler:stop'),
  getStatus: () => ipcRenderer.invoke('snaffler:status'),
  validateConfig: (config) => ipcRenderer.invoke('snaffler:validate-config', config),
  loadConfig: (filePath) => ipcRenderer.invoke('snaffler:load-config', filePath),
  saveConfig: (filePath, config) => ipcRenderer.invoke('snaffler:save-config', filePath, config),
  generateExampleConfig: (outputPath) => ipcRenderer.invoke('snaffler:generate-example-config', outputPath),

  onFileResult: (callback) => {
    const listener = (_event: any, result: FileResult) => callback(result);
    ipcRenderer.on('snaffler:file-result', listener);
    return () => ipcRenderer.removeListener('snaffler:file-result', listener);
  },

  onStatusUpdate: (callback) => {
    const listener = (_event: any, status: ScanStatus) => callback(status);
    ipcRenderer.on('snaffler:status-update', listener);
    return () => ipcRenderer.removeListener('snaffler:status-update', listener);
  },

  onError: (callback) => {
    const listener = (_event: any, error: string) => callback(error);
    ipcRenderer.on('snaffler:error', listener);
    return () => ipcRenderer.removeListener('snaffler:error', listener);
  },

  onComplete: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('snaffler:complete', listener);
    return () => ipcRenderer.removeListener('snaffler:complete', listener);
  },

  onLog: (callback) => {
    const listener = (_event: any, log: { level: string; message: string }) => callback(log);
    ipcRenderer.on('snaffler:log', listener);
    return () => ipcRenderer.removeListener('snaffler:log', listener);
  },
};

// Expose API via context bridge
contextBridge.exposeInMainWorld('snaffler', snafflerAPI);

// Type declaration for window object (use in your React app)
declare global {
  interface Window {
    snaffler: SnafflerAPI;
  }
}
