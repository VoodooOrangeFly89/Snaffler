/**
 * Main export file for Electron-Snaffler
 * Import everything you need from this file
 */

// Core
export { SnafflerEngine } from './core/SnafflerEngine';
export { Config } from './core/Config';
export * from './core/types';

// Discovery
export { ShareFinder } from './discovery/ShareFinder';
export { AdDiscovery } from './discovery/AdDiscovery';

// Scanning
export { TreeWalker } from './scanning/TreeWalker';
export { FileScanner } from './scanning/FileScanner';

// Classifiers
export { ClassifierEngine } from './classifiers/ClassifierEngine';

// Rules
export { RuleLoader } from './rules/RuleLoader';

// Electron integration
export { registerSnafflerHandlers, unregisterSnafflerHandlers } from './electron/ipc-handlers';
export type { SnafflerAPI } from './electron/preload';
export { useSnaffler, SnafflerComponent } from './electron/useSnaffler';
