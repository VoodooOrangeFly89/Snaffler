# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Application                        │
│                                                                 │
│  ┌─────────────────┐                    ┌─────────────────┐   │
│  │  Renderer       │                    │  Main Process   │   │
│  │  Process        │◄───────IPC────────►│                 │   │
│  │  (React)        │                    │                 │   │
│  └─────────────────┘                    └─────────────────┘   │
│         │                                        │             │
│         │ useSnaffler()                          │             │
│         │ Hook                                   │             │
│         ▼                                        ▼             │
│  ┌─────────────────┐                    ┌─────────────────┐   │
│  │  window.snaffler│                    │  IPC Handlers   │   │
│  │  API            │                    │                 │   │
│  └─────────────────┘                    └─────────────────┘   │
│         ▲                                        │             │
│         │                                        ▼             │
│  ┌─────────────────┐                    ┌─────────────────┐   │
│  │  Preload Script │                    │ SnafflerEngine  │   │
│  │  (Context       │                    │                 │   │
│  │   Bridge)       │                    └─────────────────┘   │
│  └─────────────────┘                            │             │
└─────────────────────────────────────────────────┼─────────────┘
                                                  │
                    ┌─────────────────────────────┴─────────────────────────────┐
                    │                                                           │
                    ▼                                                           ▼
        ┌───────────────────────┐                              ┌───────────────────────┐
        │  Discovery Layer      │                              │  Scanning Layer       │
        │                       │                              │                       │
        │  ├─ ShareFinder       │                              │  ├─ TreeWalker        │
        │  │   (SMB shares)     │                              │  │   (Dir traversal)  │
        │  │                    │                              │  │                    │
        │  └─ AdDiscovery       │                              │  └─ FileScanner       │
        │      (LDAP/AD)        │                              │      (Content search) │
        └───────────────────────┘                              └───────────────────────┘
                    │                                                           │
                    │                                                           │
                    └─────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  Classification Layer │
                          │                       │
                          │  ├─ RuleLoader        │
                          │  │   (JSON/TOML)      │
                          │  │                    │
                          │  └─ ClassifierEngine  │
                          │      (Pattern match)  │
                          └───────────────────────┘
```

## Component Breakdown

### 1. Core Layer

**SnafflerEngine** (`src/core/SnafflerEngine.ts`)
- Main orchestrator
- Manages scan lifecycle
- Coordinates all subsystems
- Event emission (file results, status updates, errors)

**Config** (`src/core/Config.ts`)
- Configuration management
- Validation
- JSON serialization
- CLI argument parsing

**Types** (`src/core/types.ts`)
- TypeScript type definitions
- Enums (TriageLevel, MatchAction, etc.)
- Interfaces (FileResult, ShareInfo, etc.)

### 2. Discovery Layer

**ShareFinder** (`src/discovery/ShareFinder.ts`)
- SMB share enumeration
- Uses PowerShell/net view
- Accessibility testing
- Bulk operations with concurrency control

**AdDiscovery** (`src/discovery/AdDiscovery.ts`)
- Active Directory LDAP queries
- Computer discovery
- Domain controller enumeration
- DNS resolution

### 3. Scanning Layer

**TreeWalker** (`src/scanning/TreeWalker.ts`)
- Recursive directory traversal
- Async generator pattern
- Directory filtering via classifiers
- Error handling and statistics

**FileScanner** (`src/scanning/FileScanner.ts`)
- Individual file analysis
- Content reading (text/binary)
- File snaffling (copying)
- Concurrent scanning with limits

### 4. Classification Layer

**ClassifierEngine** (`src/classifiers/ClassifierEngine.ts`)
- Rule-based matching
- Multiple match locations (file name, content, etc.)
- Pattern types (exact, contains, regex, etc.)
- Triage level assignment

**RuleLoader** (`src/rules/RuleLoader.ts`)
- JSON/TOML rule parsing
- Directory scanning
- Rule validation
- Export capabilities

### 5. Electron Integration Layer

**IPC Handlers** (`src/electron/ipc-handlers.ts`)
- Main process IPC handlers
- Engine lifecycle management
- Config loading/saving
- Event forwarding to renderer

**Preload Script** (`src/electron/preload.ts`)
- Context bridge API
- Type-safe IPC wrapper
- Event listener management
- Security boundary

**React Hook** (`src/electron/useSnaffler.tsx`)
- React integration
- State management
- Event subscriptions
- Cleanup handling

## Data Flow

### Scan Initialization

```
User Action (React)
    │
    ▼
useSnaffler.startScan(config)
    │
    ▼
window.snaffler.start(config)  [Preload API]
    │
    ▼
ipcMain.handle('snaffler:start')  [IPC Handler]
    │
    ▼
new SnafflerEngine(config)
    │
    ▼
engine.initialize()  [Load rules]
    │
    ▼
engine.start()  [Begin scan]
```

### Scanning Process

```
SnafflerEngine.start()
    │
    ├─► Determine targets (paths/computers)
    │       │
    │       ├─ pathTargets → scan directories
    │       └─ computerTargets → enumerate shares → scan shares
    │
    ├─► For each target:
    │       │
    │       ▼
    │   ShareFinder.findShares() [if computer target]
    │       │
    │       ▼
    │   ClassifierEngine.classifyShare()
    │       │
    │       ▼
    │   TreeWalker.walk(sharePath)
    │       │
    │       ▼
    │   For each file:
    │       │
    │       ▼
    │   ClassifierEngine.classifyFile()
    │       │
    │       ▼
    │   FileScanner.scanFile()
    │       │
    │       ├─ Read content (if needed)
    │       ├─ ClassifierEngine.classifyFileContents()
    │       ├─ Extract match context
    │       └─ Snaffle file (if action = Snaffle)
    │       │
    │       ▼
    │   Emit FileResult event
    │       │
    │       ▼
    │   IPC send to renderer
    │       │
    │       ▼
    │   Update React state
    │       │
    │       ▼
    │   UI updates
    │
    └─► emit('complete')
```

### Event Flow

```
SnafflerEngine Events
    │
    ├─ onFileResult ──────────► IPC send ──► React setState ──► UI update
    │
    ├─ onStatusUpdate ────────► IPC send ──► React setState ──► Progress bar
    │
    ├─ onError ───────────────► IPC send ──► React setState ──► Error display
    │
    ├─ onComplete ────────────► IPC send ──► React setState ──► Notification
    │
    └─ onLog ─────────────────► IPC send ──► React setState ──► Log console
```

## Concurrency Model

### Thread Pools

The engine uses configurable concurrency limits:

```typescript
{
  shareThreads: 30,    // Concurrent share enumerations
  treeThreads: 20,     // Concurrent directory walks
  fileThreads: 50,     // Concurrent file scans
  maxFileQueue: 200000 // Max queued files
}
```

### Async Patterns

- **Share enumeration**: Parallel with `findSharesBulk()`
- **File scanning**: Concurrent with `scanFilesConcurrent()`
- **Directory walking**: Async generator (`async *walk()`)
- **Batching**: Files processed in batches of 100

## Security Considerations

### Electron Security

1. **Context Isolation**: Enabled in preload script
2. **Node Integration**: Disabled in renderer
3. **Sandbox**: Disabled for file system access (required)
4. **IPC Validation**: Config validated before use

### File Access

- All file operations use `fs.promises` (async)
- Error handling for access denied scenarios
- Size limits on file reading (configurable)
- No execution of discovered files

### Rule System

- Rules define what to look for, not execute
- Regex patterns are sandboxed (no eval)
- Triage levels guide prioritization
- Actions limited to: Snaffle, Relay, Discard

## Performance Optimizations

1. **Streaming**: TreeWalker uses async generators
2. **Batching**: Files processed in batches to reduce overhead
3. **Concurrency**: Configurable thread pools
4. **Size Limits**: Skip large files (configurable)
5. **Early Filtering**: Discard at earliest opportunity
6. **Queue Limits**: Prevent memory exhaustion

## Extension Points

### Adding Custom Classifiers

```typescript
import { ClassifierRule } from 'electron-snaffler';

const customRule: ClassifierRule = {
  RuleName: 'MyRule',
  // ... configuration
};

config.customRules = [customRule];
```

### Custom Discovery

Extend `ShareFinder` or `AdDiscovery`:

```typescript
class CustomDiscovery extends ShareFinder {
  async findCustomShares(): Promise<ShareInfo[]> {
    // Your implementation
  }
}
```

### Event Processing

Subscribe to engine events:

```typescript
engine.on('fileResult', (result: FileResult) => {
  // Custom processing
  exportToDatabase(result);
});
```

## Platform Differences

### Windows
- Full SMB share enumeration
- Active Directory integration
- PowerShell-based discovery
- Native Windows APIs

### macOS/Linux
- Local file scanning only
- No SMB enumeration (use mounted shares)
- No Active Directory integration
- Limited to Node.js file APIs

## Deployment

### As Module

```bash
npm install electron-snaffler
```

### Embedded

```bash
cp -r electron-snaffler /path/to/app/
cd /path/to/app/electron-snaffler
npm install && npm run build
```

### Build Output

```
dist/
├── core/          # Engine and config
├── discovery/     # Share and AD discovery
├── scanning/      # File scanning
├── classifiers/   # Rule matching
├── rules/         # Rule loader
└── electron/      # IPC and React integration
```

## Future Enhancements

1. **Worker Threads**: Move scanning to worker threads
2. **SQLite Storage**: Persist results in database
3. **Real-time Monitoring**: Watch directories for changes
4. **Scheduled Scans**: Cron-like scheduling
5. **Report Generation**: PDF/HTML reports
6. **Cloud Integration**: Upload results to cloud storage
7. **Machine Learning**: AI-based sensitive data detection
8. **Differential Scanning**: Track changes between scans
