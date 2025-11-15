/**
 * Configuration management for Electron-Snaffler
 */

import { SnafflerConfig, DEFAULT_CONFIG, ClassifierRule } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class Config {
  private config: SnafflerConfig;

  constructor(configOptions?: Partial<SnafflerConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...configOptions,
    };
  }

  /**
   * Load configuration from JSON file
   */
  static fromFile(filePath: string): Config {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const jsonConfig = JSON.parse(fileContent);
    return new Config(jsonConfig);
  }

  /**
   * Save configuration to JSON file
   */
  saveToFile(filePath: string): void {
    const jsonConfig = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(filePath, jsonConfig, 'utf-8');
  }

  /**
   * Get the configuration object
   */
  getConfig(): SnafflerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  update(updates: Partial<SnafflerConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check thread counts
    if (this.config.shareThreads < 1) {
      errors.push('shareThreads must be at least 1');
    }
    if (this.config.treeThreads < 1) {
      errors.push('treeThreads must be at least 1');
    }
    if (this.config.fileThreads < 1) {
      errors.push('fileThreads must be at least 1');
    }

    // Check size limits
    if (this.config.maxSizeToGrep < 0) {
      errors.push('maxSizeToGrep cannot be negative');
    }
    if (this.config.maxSizeToSnaffle < 0) {
      errors.push('maxSizeToSnaffle cannot be negative');
    }

    // Check snaffle directory if enabled
    if (this.config.enableSnaffle && !this.config.snaffleOutputDir) {
      errors.push('snaffleOutputDir must be specified when enableSnaffle is true');
    }

    // Check that at least one target is specified
    const hasTargets =
      (this.config.pathTargets && this.config.pathTargets.length > 0) ||
      (this.config.computerTargets && this.config.computerTargets.length > 0) ||
      this.config.domain;

    if (!hasTargets) {
      errors.push('At least one target must be specified (pathTargets, computerTargets, or domain)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate example configuration file
   */
  static generateExample(outputPath: string): void {
    const exampleConfig: SnafflerConfig = {
      ...DEFAULT_CONFIG,
      pathTargets: ['\\\\SERVER\\Share', 'C:\\Users\\Public'],
      computerTargets: ['DC01', 'FILE01'],
      domain: 'CORP.LOCAL',
      ldapFilter: '(objectClass=computer)',
      outputFile: './snaffler-results.json',
      enableSnaffle: true,
      snaffleOutputDir: './snaffle-output',
      ruleDir: './custom-rules',
    };

    const jsonConfig = JSON.stringify(exampleConfig, null, 2);
    fs.writeFileSync(outputPath, jsonConfig, 'utf-8');
  }

  /**
   * Merge CLI arguments with config (CLI takes precedence)
   */
  static fromCLI(cliArgs: any, configFile?: string): Config {
    let config: Config;

    if (configFile && fs.existsSync(configFile)) {
      config = Config.fromFile(configFile);
    } else {
      config = new Config();
    }

    // Override with CLI arguments
    const updates: Partial<SnafflerConfig> = {};

    if (cliArgs.domain) updates.domain = cliArgs.domain;
    if (cliArgs.dc) updates.domainController = cliArgs.dc;
    if (cliArgs.pathTargets) updates.pathTargets = cliArgs.pathTargets;
    if (cliArgs.computerTargets) updates.computerTargets = cliArgs.computerTargets;
    if (cliArgs.outputFile) updates.outputFile = cliArgs.outputFile;
    if (cliArgs.logLevel) updates.logLevel = cliArgs.logLevel;
    if (cliArgs.enableSnaffle !== undefined) updates.enableSnaffle = cliArgs.enableSnaffle;
    if (cliArgs.snaffleOutputDir) updates.snaffleOutputDir = cliArgs.snaffleOutputDir;
    if (cliArgs.shareThreads) updates.shareThreads = parseInt(cliArgs.shareThreads);
    if (cliArgs.treeThreads) updates.treeThreads = parseInt(cliArgs.treeThreads);
    if (cliArgs.fileThreads) updates.fileThreads = parseInt(cliArgs.fileThreads);

    config.update(updates);

    return config;
  }
}
