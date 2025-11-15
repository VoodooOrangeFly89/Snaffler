/**
 * Main Snaffler engine - orchestrates the entire scanning process
 */

import { EventEmitter } from 'events';
import { Config } from './Config';
import {
  SnafflerConfig,
  FileResult,
  ScanStatus,
  SnafflerEventCallbacks,
  MessageType,
  SnafflerMessage,
} from './types';
import { RuleLoader } from '../rules/RuleLoader';
import { ClassifierEngine } from '../classifiers/ClassifierEngine';
import { ShareFinder } from '../discovery/ShareFinder';
import { AdDiscovery } from '../discovery/AdDiscovery';
import { TreeWalker } from '../scanning/TreeWalker';
import { FileScanner } from '../scanning/FileScanner';
import * as path from 'path';

export class SnafflerEngine extends EventEmitter {
  private config: SnafflerConfig;
  private ruleLoader: RuleLoader;
  private classifier?: ClassifierEngine;
  private shareFinder: ShareFinder;
  private adDiscovery?: AdDiscovery;

  private status: ScanStatus = {
    isRunning: false,
    computersQueued: 0,
    computersScanned: 0,
    sharesQueued: 0,
    sharesScanned: 0,
    directoriesQueued: 0,
    directoriesScanned: 0,
    filesQueued: 0,
    filesScanned: 0,
    resultsFound: 0,
    errors: 0,
  };

  private callbacks?: SnafflerEventCallbacks;
  private isAborted = false;

  constructor(config: SnafflerConfig, callbacks?: SnafflerEventCallbacks) {
    super();
    this.config = config;
    this.callbacks = callbacks;

    this.ruleLoader = new RuleLoader();
    this.shareFinder = new ShareFinder();

    if (config.domain) {
      this.adDiscovery = new AdDiscovery(config.domain, config.domainController);
    }
  }

  /**
   * Initialize the engine (load rules, etc.)
   */
  async initialize(): Promise<void> {
    this.log('info', 'Initializing Snaffler Engine...');

    // Load rules
    if (this.config.ruleDir) {
      this.log('info', `Loading rules from ${this.config.ruleDir}`);
      this.ruleLoader.loadFromDirectory(this.config.ruleDir);
    }

    // Add custom rules
    if (this.config.customRules) {
      for (const rule of this.config.customRules) {
        this.ruleLoader.addRule(rule);
      }
    }

    // Create classifier
    const rules = this.ruleLoader.getRules();
    this.classifier = new ClassifierEngine(rules);

    this.log('info', `Loaded ${rules.length} classifier rules`);
  }

  /**
   * Start the scanning process
   */
  async start(): Promise<void> {
    if (this.status.isRunning) {
      throw new Error('Scan is already running');
    }

    this.isAborted = false;
    this.status = {
      isRunning: true,
      startTime: new Date(),
      computersQueued: 0,
      computersScanned: 0,
      sharesQueued: 0,
      sharesScanned: 0,
      directoriesQueued: 0,
      directoriesScanned: 0,
      filesQueued: 0,
      filesScanned: 0,
      resultsFound: 0,
      errors: 0,
    };

    this.emitStatus();

    try {
      // Determine targets
      const targets = await this.determineTargets();

      if (targets.pathTargets.length > 0) {
        await this.scanPaths(targets.pathTargets);
      }

      if (targets.computerTargets.length > 0) {
        await this.scanComputers(targets.computerTargets);
      }

      this.status.endTime = new Date();
      this.log('info', 'Scan completed successfully');
      this.emitComplete();
    } catch (error) {
      this.status.errors++;
      this.log('error', `Scan failed: ${error}`);
      this.emitError(error as Error);
    } finally {
      this.status.isRunning = false;
      this.emitStatus();
    }
  }

  /**
   * Abort the scanning process
   */
  abort(): void {
    this.isAborted = true;
    this.log('info', 'Scan aborted by user');
  }

  /**
   * Get current scan status
   */
  getStatus(): ScanStatus {
    return { ...this.status };
  }

  /**
   * Determine scan targets from configuration
   */
  private async determineTargets(): Promise<{
    pathTargets: string[];
    computerTargets: string[];
  }> {
    const pathTargets = this.config.pathTargets || [];
    const computerTargets = this.config.computerTargets || [];

    // If domain is specified, discover computers
    if (this.config.domain && this.adDiscovery) {
      this.log('info', `Discovering computers in domain ${this.config.domain}`);

      const computers = await this.adDiscovery.findComputers(this.config.ldapFilter);
      const computerNames = AdDiscovery.getUniqueNames(computers);

      this.log('info', `Found ${computerNames.length} computers in domain`);
      computerTargets.push(...computerNames);
    }

    return { pathTargets, computerTargets };
  }

  /**
   * Scan specific paths (UNC paths or local paths)
   */
  private async scanPaths(paths: string[]): Promise<void> {
    this.status.directoriesQueued += paths.length;

    for (const pathTarget of paths) {
      if (this.isAborted) break;

      this.status.currentActivity = `Scanning ${pathTarget}`;
      this.emitStatus();

      await this.scanDirectory(pathTarget);

      this.status.directoriesScanned++;
      this.emitStatus();
    }
  }

  /**
   * Scan specific computers (enumerate shares first)
   */
  private async scanComputers(computers: string[]): Promise<void> {
    this.status.computersQueued = computers.length;

    // Find shares in parallel batches
    const shareMap = await this.shareFinder.findSharesBulk(
      computers,
      this.config.shareThreads
    );

    for (const [computerName, shares] of shareMap) {
      if (this.isAborted) break;

      this.status.computersScanned++;

      // Filter shares
      const filteredShares = ShareFinder.filterShares(shares, {
        excludeAdmin: true,
        excludeInaccessible: true,
        includeSystemShares: this.config.scanSysvol || this.config.scanNetlogon,
      });

      this.status.sharesQueued += filteredShares.length;

      for (const share of filteredShares) {
        if (this.isAborted) break;

        // Classify share
        if (this.classifier) {
          const result = this.classifier.classifyShare(share.shareName, computerName);
          if (result.action === 'Discard') {
            continue;
          }
        }

        this.status.currentActivity = `Scanning ${share.sharePath}`;
        this.emitStatus();

        await this.scanDirectory(share.sharePath, share.sharePath, computerName);

        this.status.sharesScanned++;
        this.emitStatus();
      }
    }
  }

  /**
   * Scan a directory recursively
   */
  private async scanDirectory(
    directoryPath: string,
    sharePath?: string,
    computerName?: string
  ): Promise<void> {
    if (!this.classifier) return;

    // Create tree walker with classifier
    const treeWalker = new TreeWalker({
      maxDepth: 50, // Reasonable depth limit
      ignoreErrors: true,
      classifier: this.classifier,
    });

    // Create file scanner
    const fileScanner = new FileScanner(this.classifier, {
      maxSizeToGrep: this.config.maxSizeToGrep,
      matchContextBytes: this.config.matchContextBytes,
      enableSnaffle: this.config.enableSnaffle,
      snaffleOutputDir: this.config.snaffleOutputDir,
      maxSizeToSnaffle: this.config.maxSizeToSnaffle,
    });

    // Scan files in batches
    const fileBatch: string[] = [];
    const batchSize = 100;

    try {
      for await (const file of treeWalker.walkWithClassifier(directoryPath, this.classifier)) {
        if (this.isAborted) break;

        fileBatch.push(file.path);
        this.status.filesQueued++;

        // Process batch when full
        if (fileBatch.length >= batchSize) {
          await this.processBatch(
            fileScanner,
            [...fileBatch],
            sharePath,
            computerName
          );
          fileBatch.length = 0;
        }

        this.emitStatus();
      }

      // Process remaining files
      if (fileBatch.length > 0 && !this.isAborted) {
        await this.processBatch(fileScanner, fileBatch, sharePath, computerName);
      }
    } catch (error) {
      this.status.errors++;
      this.log('error', `Error scanning directory ${directoryPath}: ${error}`);
    }
  }

  /**
   * Process a batch of files
   */
  private async processBatch(
    scanner: FileScanner,
    files: string[],
    sharePath?: string,
    computerName?: string
  ): Promise<void> {
    const results = await scanner.scanFilesConcurrent(
      files,
      this.config.fileThreads,
      sharePath,
      computerName
    );

    for (const result of results) {
      this.status.filesScanned++;
      this.status.resultsFound++;

      this.emitFileResult(result);
    }

    this.emitStatus();
  }

  /**
   * Emit events
   */
  private emitFileResult(result: FileResult): void {
    this.emit('fileResult', result);
    if (this.callbacks?.onFileResult) {
      this.callbacks.onFileResult(result);
    }
  }

  private emitStatus(): void {
    this.emit('statusUpdate', this.status);
    if (this.callbacks?.onStatusUpdate) {
      this.callbacks.onStatusUpdate(this.status);
    }
  }

  private emitError(error: Error): void {
    this.emit('error', error);
    if (this.callbacks?.onError) {
      this.callbacks.onError(error);
    }
  }

  private emitComplete(): void {
    this.emit('complete');
    if (this.callbacks?.onComplete) {
      this.callbacks.onComplete();
    }
  }

  private log(level: string, message: string): void {
    this.emit('log', level, message);
    if (this.callbacks?.onLog) {
      this.callbacks.onLog(level, message);
    }
  }
}
