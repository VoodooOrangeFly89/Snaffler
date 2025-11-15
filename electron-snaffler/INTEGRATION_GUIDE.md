# Integration Guide for CommandCentre

This guide will walk you through integrating Electron-Snaffler into your CommandCentre Electron/React application.

## Step-by-Step Integration

### Step 1: Copy the Module

Copy the entire `electron-snaffler` folder into your CommandCentre project:

```bash
# From the Snaffler directory
cp -r electron-snaffler /path/to/your/CommandCentre/
```

Or if CommandCentre is in a different location:

```bash
cp -r electron-snaffler ../CommandCentre/
```

### Step 2: Install Dependencies

```bash
cd /path/to/CommandCentre/electron-snaffler
npm install
npm run build
```

This will:
- Install TypeScript and Node types
- Compile TypeScript to JavaScript in the `dist/` folder

### Step 3: Update Your Electron Main Process

In your main Electron process file (usually `main.ts`, `main.js`, or `electron/main.ts`):

```typescript
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { registerSnafflerHandlers } from './electron-snaffler/dist/electron/ipc-handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // IMPORTANT: Add the Snaffler preload script
      preload: path.join(__dirname, 'electron-snaffler/dist/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for file system access
    },
  });

  // Register Snaffler IPC handlers AFTER window creation
  registerSnafflerHandlers(mainWindow);

  // Your existing window setup
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile('build/index.html');
  }
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

### Step 4: Create Type Declarations (TypeScript)

If you're using TypeScript in your React app, create a type declaration file:

**`src/types/electron.d.ts`**:

```typescript
import { SnafflerAPI } from '../electron-snaffler/src/electron/preload';

declare global {
  interface Window {
    snaffler: SnafflerAPI;
  }
}

export {};
```

### Step 5: Create a Snaffler Scanner Component

Create a new React component in your CommandCentre:

**`src/components/SnafflerScanner.tsx`**:

```typescript
import React, { useState } from 'react';
import { useSnaffler } from '../../electron-snaffler/dist/electron/useSnaffler';
import { TriageLevel } from '../../electron-snaffler/dist/core/types';

export function SnafflerScanner() {
  const {
    isScanning,
    status,
    results,
    errors,
    logs,
    startScan,
    stopScan,
    clearResults,
  } = useSnaffler();

  const [targetPath, setTargetPath] = useState('');

  const handleStartScan = async () => {
    const config = {
      pathTargets: [targetPath],
      shareFinderEnabled: false, // Set to true if scanning network
      logLevel: 'info' as const,
      maxSizeToGrep: 1000000, // 1MB
      enableSnaffle: false, // Enable to copy files
      ruleDir: './electron-snaffler/src/rules/default-rules',
    };

    const success = await startScan(config);
    if (!success) {
      alert('Failed to start scan. Check the console for errors.');
    }
  };

  const getTriageColor = (triage: TriageLevel) => {
    switch (triage) {
      case 'Red': return '#dc3545';
      case 'Yellow': return '#ffc107';
      case 'Green': return '#28a745';
      default: return '#6c757d';
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Snaffler Scanner</h1>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={targetPath}
          onChange={(e) => setTargetPath(e.target.value)}
          placeholder="Enter path to scan (e.g., C:\\Users\\Public)"
          style={{ width: '400px', marginRight: '10px' }}
        />
        <button onClick={handleStartScan} disabled={isScanning || !targetPath}>
          {isScanning ? 'Scanning...' : 'Start Scan'}
        </button>
        <button onClick={stopScan} disabled={!isScanning} style={{ marginLeft: '10px' }}>
          Stop
        </button>
        <button onClick={clearResults} style={{ marginLeft: '10px' }}>
          Clear Results
        </button>
      </div>

      {status && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h3>Scan Status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>Files Queued: {status.filesQueued}</div>
            <div>Files Scanned: {status.filesScanned}</div>
            <div>Results Found: {status.resultsFound}</div>
            <div>Directories Scanned: {status.directoriesScanned}</div>
            <div>Errors: {status.errors}</div>
            <div>Status: {status.isRunning ? '🟢 Running' : '⚪ Idle'}</div>
          </div>
          {status.currentActivity && (
            <div style={{ marginTop: '10px', fontStyle: 'italic' }}>
              {status.currentActivity}
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8d7da', borderRadius: '5px' }}>
          <h3>Errors</h3>
          <ul>
            {errors.map((error, i) => (
              <li key={i} style={{ color: '#721c24' }}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h3>Results ({results.length})</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {results.length === 0 ? (
            <p>No results yet. Start a scan to find sensitive files.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#e9ecef' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>File</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Path</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Triage</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Rule</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '10px' }}>{result.fileName}</td>
                    <td style={{ padding: '10px', fontSize: '12px' }}>{result.filePath}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        color: getTriageColor(result.triage),
                        fontWeight: 'bold'
                      }}>
                        {result.triage}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px' }}>{result.matchedRule}</td>
                    <td style={{ padding: '10px' }}>{(result.fileSize / 1024).toFixed(2)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {logs.length > 0 && (
        <div>
          <h3>Logs</h3>
          <div style={{
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '10px',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}>
            {logs.map((log, i) => (
              <div key={i}>
                [{log.timestamp.toLocaleTimeString()}] {log.level.toUpperCase()}: {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 6: Add to Your App Router

Add the Snaffler scanner to your CommandCentre's routing:

```typescript
// In your App.tsx or router configuration
import { SnafflerScanner } from './components/SnafflerScanner';

// Add a route or menu item
<Route path="/scanner" element={<SnafflerScanner />} />
```

### Step 7: Build and Test

1. Build the Electron app:

```bash
npm run build
```

2. Run in development mode:

```bash
npm run dev
# or
npm start
```

3. Test the scanner:
   - Navigate to the Snaffler Scanner page
   - Enter a path like `C:\Users\Public` or a network share
   - Click "Start Scan"
   - Watch the results appear in real-time

## Advanced Configuration

### Custom Rules

Create custom rules in `electron-snaffler/src/rules/custom-rules/`:

**`my-custom-rules.json`**:

```json
{
  "ClassifierRules": [
    {
      "RuleName": "MyCompanySecrets",
      "EnumerationScope": "FileEnumeration",
      "MatchLocation": "FileName",
      "WordListType": "Contains",
      "WordList": ["confidential", "secret", "internal"],
      "MatchAction": "Snaffle",
      "Triage": "Red"
    }
  ]
}
```

Then reference it in your config:

```typescript
const config = {
  ruleDir: './electron-snaffler/src/rules/custom-rules',
  // ... other options
};
```

### Network Scanning

To scan network shares and Active Directory:

```typescript
const config = {
  domain: 'CORP.LOCAL',
  domainController: 'DC01.CORP.LOCAL',
  shareFinderEnabled: true,
  scanSysvol: true,
  scanNetlogon: true,
  shareThreads: 30,
  treeThreads: 20,
  fileThreads: 50,
  ruleDir: './electron-snaffler/src/rules/default-rules',
};
```

**Note**: Network scanning requires appropriate permissions and works best on Windows.

### File Snaffling (Copying)

To automatically copy interesting files:

```typescript
const config = {
  enableSnaffle: true,
  snaffleOutputDir: './captured-files',
  maxSizeToSnaffle: 10000000, // 10MB max
  // ... other options
};
```

## Troubleshooting

### "window.snaffler is undefined"

- Check that the preload script path is correct in your BrowserWindow config
- Ensure `contextIsolation: true` is set
- Rebuild the electron-snaffler module: `npm run build`

### "Permission denied" errors

- Make sure your Electron app has the necessary file system permissions
- On Windows, run as administrator for network shares
- Check that `sandbox: false` is set in webPreferences

### Rules not loading

- Verify the `ruleDir` path is correct (relative to your app's working directory)
- Check that rule files are valid JSON
- Look for errors in the console/logs

## Next Steps

1. Customize the UI to match your CommandCentre design
2. Add result export functionality (CSV, JSON)
3. Create saved scan profiles
4. Integrate with your existing security workflows
5. Add scheduled scanning capabilities

## Support

For issues or questions:
1. Check the main README.md
2. Review the TypeScript types for API reference
3. Look at the example component code
4. Check the browser console for errors
