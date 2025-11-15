/**
 * Electron IPC handlers for Snaffler integration
 * Use these in your Electron main process
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { SnafflerEngine } from '../core/SnafflerEngine';
import { Config } from '../core/Config';
import { SnafflerConfig, FileResult, ScanStatus } from '../core/types';

// Global engine instance (one scan at a time)
let currentEngine: SnafflerEngine | null = null;

/**
 * Register all Snaffler IPC handlers
 * Call this in your main process initialization
 */
export function registerSnafflerHandlers(mainWindow: Electron.BrowserWindow): void {
  // Start a new scan
  ipcMain.handle('snaffler:start', async (event: IpcMainInvokeEvent, configOptions: Partial<SnafflerConfig>) => {
    try {
      if (currentEngine?.getStatus().isRunning) {
        throw new Error('A scan is already running');
      }

      const config = new Config(configOptions);
      const validation = config.validate();

      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }

      // Create engine with callbacks to send to renderer
      currentEngine = new SnafflerEngine(config.getConfig(), {
        onFileResult: (result: FileResult) => {
          mainWindow.webContents.send('snaffler:file-result', result);
        },
        onStatusUpdate: (status: ScanStatus) => {
          mainWindow.webContents.send('snaffler:status-update', status);
        },
        onError: (error: Error) => {
          mainWindow.webContents.send('snaffler:error', error.message);
        },
        onComplete: () => {
          mainWindow.webContents.send('snaffler:complete');
        },
        onLog: (level: string, message: string) => {
          mainWindow.webContents.send('snaffler:log', { level, message });
        },
      });

      await currentEngine.initialize();

      // Start scan in background
      currentEngine.start().catch(error => {
        mainWindow.webContents.send('snaffler:error', error.message);
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        errors: [(error as Error).message],
      };
    }
  });

  // Stop the current scan
  ipcMain.handle('snaffler:stop', async () => {
    if (currentEngine) {
      currentEngine.abort();
      return { success: true };
    }
    return { success: false, error: 'No scan running' };
  });

  // Get current scan status
  ipcMain.handle('snaffler:status', async () => {
    if (currentEngine) {
      return currentEngine.getStatus();
    }
    return null;
  });

  // Validate configuration
  ipcMain.handle('snaffler:validate-config', async (event: IpcMainInvokeEvent, configOptions: Partial<SnafflerConfig>) => {
    const config = new Config(configOptions);
    return config.validate();
  });

  // Load configuration from file
  ipcMain.handle('snaffler:load-config', async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      const config = Config.fromFile(filePath);
      return {
        success: true,
        config: config.getConfig(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Save configuration to file
  ipcMain.handle('snaffler:save-config', async (event: IpcMainInvokeEvent, filePath: string, configOptions: Partial<SnafflerConfig>) => {
    try {
      const config = new Config(configOptions);
      config.saveToFile(filePath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Generate example configuration
  ipcMain.handle('snaffler:generate-example-config', async (event: IpcMainInvokeEvent, outputPath: string) => {
    try {
      Config.generateExample(outputPath);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });
}

/**
 * Unregister all handlers (cleanup)
 */
export function unregisterSnafflerHandlers(): void {
  ipcMain.removeHandler('snaffler:start');
  ipcMain.removeHandler('snaffler:stop');
  ipcMain.removeHandler('snaffler:status');
  ipcMain.removeHandler('snaffler:validate-config');
  ipcMain.removeHandler('snaffler:load-config');
  ipcMain.removeHandler('snaffler:save-config');
  ipcMain.removeHandler('snaffler:generate-example-config');
}
