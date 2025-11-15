# Electron-Snaffler

**Electron-compatible version of Snaffler** - A TypeScript/Node.js port of the popular Snaffler tool for discovering sensitive files in Windows/AD environments, designed to be embedded in Electron applications.

## Overview

This is a complete rewrite of Snaffler (originally C# .NET) in TypeScript/Node.js, specifically designed to integrate seamlessly with Electron/React applications. It maintains the core functionality while providing modern JavaScript/TypeScript APIs.

### Key Features

- ✅ **SMB Share Enumeration** - Discover and scan network shares
- ✅ **Active Directory Integration** - Query AD for computers and domain controllers
- ✅ **Recursive File Scanning** - Walk directory trees with smart filtering
- ✅ **Rule-Based Classification** - Flexible pattern matching for files and content
- ✅ **Content Analysis** - Regex-based searching for sensitive data (passwords, keys, etc.)
- ✅ **File Snaffling** - Automatically copy interesting files
- ✅ **Electron IPC Integration** - Ready-to-use IPC handlers for main process
- ✅ **React Hook** - `useSnaffler()` hook for easy React integration
- ✅ **Event-Driven** - Real-time updates via callbacks and events
- ✅ **TypeScript** - Full type safety and IntelliSense support
- ✅ **Complete Rule Set** - All 95 rules from original Snaffler ported to JSON

### Detection Rules

This port includes **all 95 detection rules** from the original Snaffler, organized into 6 categories:

- **Code Rules** (43 rules) - Credentials in C#, PowerShell, Python, PHP, Java, Ruby, JavaScript, etc.
- **Infrastructure Rules** (26 rules) - Certificates, databases, network configs, memory dumps, hashes
- **User Files Rules** (20 rules) - SSH keys, password managers, browser credentials, API keys
- **Discard Rules** (4 rules) - Filter false positives and noise
- **Path Rules** (2 rules) - Skip Windows system and development directories
- **Share Rules** (3 rules) - Filter admin shares, SCCM, IPC$

See [RULES.md](RULES.md) for complete documentation of all detection rules.

## Installation

### Option 1: Copy to Your Electron Project

Simply copy the `electron-snaffler` folder into your Electron project:

```bash
cp -r electron-snaffler /path/to/your/electron-app/
cd /path/to/your/electron-app/electron-snaffler
npm install
npm run build
```

### Option 2: Install as Dependency (Future)

```bash
npm install electron-snaffler
```

## Quick Start

### 1. Main Process Integration (Electron)

In your Electron main process file:

```typescript
import { app, BrowserWindow } from 'electron';
import { registerSnafflerHandlers } from './electron-snaffler/dist/electron/ipc-handlers';

let mainWindow: BrowserWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'electron-snaffler/dist/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Register Snaffler IPC handlers
  registerSnafflerHandlers(mainWindow);

  mainWindow.loadURL('http://localhost:3000');
});
```

### 2. React Component Integration

Use the provided React hook in your components:

```typescript
import { useSnaffler } from './electron-snaffler/dist/electron/useSnaffler';

function SnafflerScanner() {
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
    const config = {
      pathTargets: ['\\\\SERVER\\Share', 'C:\\Users\\Public'],
      domain: 'CORP.LOCAL',
      shareFinderEnabled: true,
      maxSizeToGrep: 1000000,
      logLevel: 'info',
      ruleDir: './electron-snaffler/src/rules/default-rules',
    };

    const success = await startScan(config);
    if (!success) {
      console.error('Failed to start scan');
    }
  };

  return (
    <div>
      <h1>Snaffler Scanner</h1>

      <button onClick={handleStartScan} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Start Scan'}
      </button>

      <button onClick={stopScan} disabled={!isScanning}>
        Stop
      </button>

      {status && (
        <div>
          <p>Files Scanned: {status.filesScanned}</p>
          <p>Results Found: {status.resultsFound}</p>
        </div>
      )}

      <ul>
        {results.map((result, i) => (
          <li key={i}>
            <strong style={{ color: result.triage === 'Red' ? 'red' : 'orange' }}>
              {result.fileName}
            </strong>
            <br />
            <small>{result.filePath}</small>
            {result.matchContext && (
              <pre>{result.matchContext}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 3. Using the API Directly

For more control, use the Snaffler engine directly:

```typescript
import { SnafflerEngine } from './electron-snaffler/dist/core/SnafflerEngine';
import { Config } from './electron-snaffler/dist/core/Config';

async function runScan() {
  const config = new Config({
    pathTargets: ['\\\\SERVER\\Share'],
    shareFinderEnabled: true,
    logLevel: 'info',
    ruleDir: './electron-snaffler/src/rules/default-rules',
  });

  const engine = new SnafflerEngine(config.getConfig(), {
    onFileResult: (result) => {
      console.log(`Found: ${result.fileName} - ${result.triage}`);
    },
    onStatusUpdate: (status) => {
      console.log(`Progress: ${status.filesScanned} files scanned`);
    },
    onError: (error) => {
      console.error('Error:', error);
    },
    onComplete: () => {
      console.log('Scan completed!');
    },
  });

  await engine.initialize();
  await engine.start();
}
```

## Configuration

### Configuration Options

```typescript
interface SnafflerConfig {
  // Targeting
  pathTargets?: string[];            // Direct UNC or local paths
  computerTargets?: string[];        // Specific computer names
  domain?: string;                   // AD domain to scan
  domainController?: string;         // Specific DC to query
  ldapFilter?: string;               // LDAP filter for computers

  // Features
  shareFinderEnabled: boolean;       // Enable share enumeration
  scanSysvol: boolean;              // Include SYSVOL shares
  scanNetlogon: boolean;            // Include NETLOGON shares
  domainUserRules: boolean;         // Search for domain usernames

  // Concurrency
  shareThreads: number;             // Share enumeration workers (default: 30)
  treeThreads: number;              // Directory traversal workers (default: 20)
  fileThreads: number;              // File scan workers (default: 50)
  maxFileQueue: number;             // Max queued files (default: 200000)

  // Scanning Limits
  maxSizeToGrep: number;            // Max file size to search contents (default: 1MB)
  maxSizeToSnaffle: number;         // Max file size to copy (default: 10MB)
  matchContextBytes: number;        // Context bytes around matches (default: 200)

  // Output
  outputFile?: string;              // Output results file
  logLevel: 'trace' | 'debug' | 'info' | 'data' | 'warn' | 'error';
  logType: 'plain' | 'json';
  enableSnaffle: boolean;           // Enable file copying
  snaffleOutputDir?: string;        // Directory for copied files

  // Rules
  ruleDir?: string;                 // Custom rules directory
  customRules?: ClassifierRule[];   // Programmatic rules
}
```

### Example Configuration File

Create a JSON config file:

```json
{
  "pathTargets": ["\\\\SERVER\\Share"],
  "domain": "CORP.LOCAL",
  "shareFinderEnabled": true,
  "scanSysvol": true,
  "logLevel": "info",
  "enableSnaffle": true,
  "snaffleOutputDir": "./snaffle-output",
  "ruleDir": "./electron-snaffler/src/rules/default-rules",
  "maxSizeToGrep": 1000000
}
```

Load it in your app:

```typescript
const config = Config.fromFile('./my-config.json');
```

## Rule System

### Rule Structure

Rules are defined in JSON format (TOML also supported):

```json
{
  "ClassifierRules": [
    {
      "RuleName": "PasswordFiles",
      "Description": "Files with 'password' in the name",
      "EnumerationScope": "FileEnumeration",
      "MatchLocation": "FileName",
      "WordListType": "Contains",
      "WordList": ["password", "passwd", "pwd"],
      "MatchAction": "Snaffle",
      "Triage": "Red"
    }
  ]
}
```

### Enumeration Scopes

- `FileEnumeration` - Match against file names/extensions/paths
- `ContentsEnumeration` - Search file contents
- `ShareEnumeration` - Filter network shares
- `DirectoryEnumeration` - Filter directories

### Match Locations

- `FileName` - Match against file name
- `FileExtension` - Match against extension
- `FilePath` - Match against full path
- `FileContentAsString` - Search text content
- `FileContentAsBytes` - Search binary content
- `ShareName` - Match share names
- `DirectoryPath` - Match directory paths

### Word List Types

- `Exact` - Exact match (case-insensitive)
- `Contains` - Substring match
- `StartsWith` - Prefix match
- `EndsWith` - Suffix match
- `Regex` - Regular expression

### Match Actions

- `Snaffle` - Copy the file (if enabled)
- `Relay` - Continue processing
- `Discard` - Ignore this item
- `CheckForKeys` - Check for certificates/keys

### Triage Levels

- `Red` - High interest (likely sensitive)
- `Yellow` - Medium interest
- `Green` - Low interest
- `Black` - Lowest priority

### Creating Custom Rules

Add custom rules programmatically:

```typescript
const customRule: ClassifierRule = {
  RuleName: 'MyCustomRule',
  EnumerationScope: EnumerationScope.FileEnumeration,
  MatchLocation: MatchLocation.FileName,
  WordListType: WordListType.Regex,
  WordList: ['secret.*\\.txt'],
  MatchAction: MatchAction.Snaffle,
  Triage: TriageLevel.Red,
};

const config = new Config({
  customRules: [customRule],
  // ... other options
});
```

## Integration with CommandCentre

To integrate with your CommandCentre Electron app:

### 1. Copy the Module

```bash
cp -r electron-snaffler /path/to/CommandCentre/
```

### 2. Update Your Main Process

```typescript
// main.ts or main.js
import { registerSnafflerHandlers } from './electron-snaffler/dist/electron/ipc-handlers';

app.on('ready', () => {
  // ... your existing setup

  registerSnafflerHandlers(mainWindow);
});
```

### 3. Add Preload Script

Update your `webPreferences`:

```typescript
webPreferences: {
  preload: path.join(__dirname, 'electron-snaffler/dist/electron/preload.js'),
  contextIsolation: true,
}
```

### 4. Create a Scanner Component

```typescript
// components/SnafflerScanner.tsx
import { useSnaffler } from '../electron-snaffler/dist/electron/useSnaffler';

export function SnafflerScanner() {
  // Use the hook as shown in Quick Start above
}
```

## API Reference

### SnafflerEngine

Main orchestrator class:

```typescript
class SnafflerEngine extends EventEmitter {
  constructor(config: SnafflerConfig, callbacks?: SnafflerEventCallbacks);

  async initialize(): Promise<void>;
  async start(): Promise<void>;
  abort(): void;
  getStatus(): ScanStatus;
}
```

### useSnaffler Hook

React hook for easy integration:

```typescript
interface UseSnafflerReturn {
  isScanning: boolean;
  status: ScanStatus | null;
  results: FileResult[];
  errors: string[];
  logs: Array<{ level: string; message: string; timestamp: Date }>;

  startScan: (config: Partial<SnafflerConfig>) => Promise<boolean>;
  stopScan: () => Promise<void>;
  clearResults: () => void;
  clearLogs: () => void;
  validateConfig: (config: Partial<SnafflerConfig>) => Promise<{ valid: boolean; errors: string[] }>;
  loadConfig: (filePath: string) => Promise<SnafflerConfig | null>;
  saveConfig: (filePath: string, config: Partial<SnafflerConfig>) => Promise<boolean>;
}
```

## Differences from Original Snaffler

### What's Different

1. **Language**: TypeScript/Node.js instead of C# .NET
2. **Platform**: Cross-platform (Windows, macOS, Linux) with Node.js
3. **Integration**: Designed for Electron IPC instead of CLI
4. **Rules**: JSON format in addition to TOML
5. **API**: Event-driven with callbacks instead of console output

### What's the Same

1. **Core Logic**: Same classification and scanning algorithms
2. **Rule System**: All 95 rules ported with compatible structure and matching logic
3. **Features**: Share enumeration, AD queries, content scanning
4. **Triage Levels**: Same severity classification (Black/Red/Yellow/Green)
5. **Detection Coverage**: Identical pattern matching for credentials, keys, and sensitive data

### Platform Notes

- **Windows**: Full functionality (SMB, AD, PowerShell)
- **macOS/Linux**: Limited - local file scanning only (no AD/SMB enumeration)

## Troubleshooting

### Common Issues

**1. "Snaffler API not available"**

Make sure the preload script is loaded:

```typescript
webPreferences: {
  preload: path.join(__dirname, 'electron-snaffler/dist/electron/preload.js'),
}
```

**2. "Access Denied" errors on shares**

Run your Electron app with appropriate credentials or use domain authentication.

**3. Rules not loading**

Check the `ruleDir` path is correct:

```typescript
ruleDir: path.join(__dirname, 'electron-snaffler/src/rules/default-rules')
```

**4. TypeScript errors**

Rebuild the project:

```bash
cd electron-snaffler
npm run build
```

## Development

### Build from Source

```bash
cd electron-snaffler
npm install
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Project Structure

```
electron-snaffler/
├── src/
│   ├── core/              # Core engine and types
│   ├── discovery/         # AD and share discovery
│   ├── scanning/          # File scanning and tree walking
│   ├── classifiers/       # Rule matching engine
│   ├── rules/             # Rule loader and default rules
│   └── electron/          # Electron integration (IPC, hooks)
├── dist/                  # Compiled JavaScript
├── example-config.json    # Example configuration
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT License - See original Snaffler for attribution

## Credits

Based on the original [Snaffler](https://github.com/SnaffCon/Snaffler) by SnaffCon team.

Ported to TypeScript/Electron by [Your Name].

## Security Notice

⚠️ **This tool is designed for authorized security testing only.** Always ensure you have proper authorization before scanning any networks or systems. Unauthorized access to computer systems is illegal.
