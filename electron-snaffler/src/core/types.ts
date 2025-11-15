/**
 * Core TypeScript types for Electron-Snaffler
 * Ported from C# Snaffler codebase
 */

// Triage levels (severity)
export enum TriageLevel {
  Black = 'Black',   // Lowest priority
  Green = 'Green',   // Low interest
  Yellow = 'Yellow', // Medium interest
  Red = 'Red',       // High interest - likely sensitive
  // Gold would be highest but not in original
}

// Match actions
export enum MatchAction {
  Snaffle = 'Snaffle',     // Copy the file
  Relay = 'Relay',         // Pass to another classifier
  Discard = 'Discard',     // Ignore
  CheckForKeys = 'CheckForKeys', // Check for certificates/keys
}

// Enumeration scopes
export enum EnumerationScope {
  FileEnumeration = 'FileEnumeration',
  ContentsEnumeration = 'ContentsEnumeration',
  ShareEnumeration = 'ShareEnumeration',
  DirectoryEnumeration = 'DirectoryEnumeration',
}

// Match locations
export enum MatchLocation {
  FileName = 'FileName',
  FileExtension = 'FileExtension',
  FilePath = 'FilePath',
  FileContentAsString = 'FileContentAsString',
  FileContentAsBytes = 'FileContentAsBytes',
  ShareName = 'ShareName',
  DirectoryPath = 'DirectoryPath',
}

// Word list matching types
export enum WordListType {
  Exact = 'Exact',
  Contains = 'Contains',
  StartsWith = 'StartsWith',
  EndsWith = 'EndsWith',
  Regex = 'Regex',
}

// Classifier rule definition
export interface ClassifierRule {
  RuleName: string;
  EnumerationScope: EnumerationScope;
  MatchAction: MatchAction;
  MatchLocation: MatchLocation;
  WordListType: WordListType;
  WordList: string[];
  Triage: TriageLevel;
  RelayTargets?: string[];
  Description?: string;
}

// File scan result
export interface FileResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  triage: TriageLevel;
  matchedRule: string;
  matchContext?: string;
  timestamp: Date;
  sharePath?: string;
  computerName?: string;
}

// Share information
export interface ShareInfo {
  computerName: string;
  shareName: string;
  sharePath: string;
  shareType: number;
  accessible: boolean;
  triage?: TriageLevel;
}

// Directory information
export interface DirectoryInfo {
  path: string;
  accessible: boolean;
  shouldScan: boolean;
  triage?: TriageLevel;
}

// Scan configuration options
export interface SnafflerConfig {
  // Targeting
  pathTargets?: string[];
  computerTargets?: string[];
  domain?: string;
  domainController?: string;
  ldapFilter?: string;

  // Features
  shareFinderEnabled: boolean;
  scanSysvol: boolean;
  scanNetlogon: boolean;
  domainUserRules: boolean;

  // Concurrency
  shareThreads: number;
  treeThreads: number;
  fileThreads: number;
  maxFileQueue: number;

  // Scanning limits
  maxSizeToGrep: number;      // Max file size to search contents
  maxSizeToSnaffle: number;   // Max file size to copy
  matchContextBytes: number;  // Context around matches

  // Output
  outputFile?: string;
  logLevel: 'trace' | 'debug' | 'info' | 'data' | 'warn' | 'error';
  logType: 'plain' | 'json';
  enableSnaffle: boolean;
  snaffleOutputDir?: string;

  // Rules
  ruleDir?: string;
  customRules?: ClassifierRule[];
}

// Default configuration
export const DEFAULT_CONFIG: SnafflerConfig = {
  shareFinderEnabled: true,
  scanSysvol: true,
  scanNetlogon: true,
  domainUserRules: false,

  shareThreads: 30,
  treeThreads: 20,
  fileThreads: 50,
  maxFileQueue: 200000,

  maxSizeToGrep: 1000000,      // 1MB
  maxSizeToSnaffle: 10000000,  // 10MB
  matchContextBytes: 200,

  logLevel: 'info',
  logType: 'plain',
  enableSnaffle: false,
};

// Scan status/progress
export interface ScanStatus {
  isRunning: boolean;
  startTime?: Date;
  endTime?: Date;

  computersQueued: number;
  computersScanned: number;

  sharesQueued: number;
  sharesScanned: number;

  directoriesQueued: number;
  directoriesScanned: number;

  filesQueued: number;
  filesScanned: number;

  resultsFound: number;

  errors: number;
  currentActivity?: string;
}

// Message types for event system
export enum MessageType {
  Info = 'Info',
  Debug = 'Debug',
  Error = 'Error',
  FileResult = 'FileResult',
  StatusUpdate = 'StatusUpdate',
  ScanComplete = 'ScanComplete',
}

export interface SnafflerMessage {
  type: MessageType;
  timestamp: Date;
  data: any;
}

// Event callbacks for Electron IPC
export interface SnafflerEventCallbacks {
  onFileResult?: (result: FileResult) => void;
  onStatusUpdate?: (status: ScanStatus) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onLog?: (level: string, message: string) => void;
}
