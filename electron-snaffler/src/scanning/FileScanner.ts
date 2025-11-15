/**
 * File scanner - analyzes individual files for sensitive content
 */

import * as fs from 'fs';
import * as path from 'path';
import { ClassifierEngine, MatchResult } from '../classifiers/ClassifierEngine';
import { FileResult, TriageLevel, MatchAction } from '../core/types';

export interface FileScanOptions {
  maxSizeToGrep: number;
  matchContextBytes: number;
  enableSnaffle: boolean;
  snaffleOutputDir?: string;
  maxSizeToSnaffle: number;
}

export class FileScanner {
  private classifier: ClassifierEngine;
  private options: FileScanOptions;

  constructor(classifier: ClassifierEngine, options: FileScanOptions) {
    this.classifier = classifier;
    this.options = options;
  }

  /**
   * Scan a file for sensitive content
   */
  async scanFile(filePath: string, sharePath?: string, computerName?: string): Promise<FileResult | null> {
    try {
      // First check file name/extension
      const fileResult = this.classifier.classifyFile(filePath);

      if (!fileResult.matched || fileResult.action === MatchAction.Discard) {
        return null;
      }

      // Get file stats
      const stats = await fs.promises.stat(filePath);

      // If file is too large to grep, just return the file match
      if (stats.size > this.options.maxSizeToGrep) {
        const result: FileResult = {
          filePath,
          fileName: path.basename(filePath),
          fileSize: stats.size,
          triage: fileResult.triage || TriageLevel.Green,
          matchedRule: fileResult.rule?.RuleName || 'FileMatch',
          timestamp: new Date(),
          sharePath,
          computerName,
        };

        // Snaffle if needed
        if (this.shouldSnaffle(result)) {
          await this.snaffleFile(filePath);
        }

        return result;
      }

      // Read file content for deeper analysis
      const content = await this.readFileContent(filePath, stats.size);

      if (!content) {
        // Return file match even if we can't read content
        return {
          filePath,
          fileName: path.basename(filePath),
          fileSize: stats.size,
          triage: fileResult.triage || TriageLevel.Green,
          matchedRule: fileResult.rule?.RuleName || 'FileMatch',
          timestamp: new Date(),
          sharePath,
          computerName,
        };
      }

      // Classify file contents
      const contentMatches = this.classifier.classifyFileContents(
        filePath,
        content,
        Buffer.isBuffer(content)
      );

      if (contentMatches.length > 0) {
        // Get highest triage from all matches
        const highestTriage = ClassifierEngine.getHighestTriage(contentMatches);

        // Extract context from first match
        let matchContext: string | undefined;
        const firstMatch = contentMatches[0];

        if (firstMatch.matchedString && typeof content === 'string') {
          matchContext = ClassifierEngine.extractMatchContext(
            content,
            firstMatch.matchedString,
            this.options.matchContextBytes
          );
        }

        const result: FileResult = {
          filePath,
          fileName: path.basename(filePath),
          fileSize: stats.size,
          triage: highestTriage,
          matchedRule: firstMatch.rule?.RuleName || 'ContentMatch',
          matchContext,
          timestamp: new Date(),
          sharePath,
          computerName,
        };

        // Snaffle if needed
        if (this.shouldSnaffle(result)) {
          await this.snaffleFile(filePath);
        }

        return result;
      }

      // Return file match if no content match but file name matched
      return {
        filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size,
        triage: fileResult.triage || TriageLevel.Green,
        matchedRule: fileResult.rule?.RuleName || 'FileMatch',
        timestamp: new Date(),
        sharePath,
        computerName,
      };
    } catch (error) {
      console.error(`Error scanning file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Read file content (text or binary)
   */
  private async readFileContent(filePath: string, fileSize: number): Promise<string | Buffer | null> {
    try {
      // Determine if file is likely text or binary
      const ext = path.extname(filePath).toLowerCase();
      const textExtensions = [
        '.txt', '.log', '.conf', '.config', '.ini', '.xml', '.json',
        '.yaml', '.yml', '.ps1', '.bat', '.cmd', '.sh', '.py', '.js',
        '.ts', '.java', '.cs', '.cpp', '.c', '.h', '.sql', '.md'
      ];

      const isLikelyText = textExtensions.includes(ext);

      if (isLikelyText) {
        // Read as text
        return await fs.promises.readFile(filePath, 'utf-8');
      } else {
        // Read as binary
        return await fs.promises.readFile(filePath);
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Determine if a file should be snaffled (copied)
   */
  private shouldSnaffle(result: FileResult): boolean {
    if (!this.options.enableSnaffle || !this.options.snaffleOutputDir) {
      return false;
    }

    // Don't snaffle if file is too large
    if (result.fileSize > this.options.maxSizeToSnaffle) {
      return false;
    }

    // Only snaffle high-value files
    const highValueTriages = [TriageLevel.Red, TriageLevel.Yellow];
    return highValueTriages.includes(result.triage);
  }

  /**
   * Copy a file to the snaffle output directory
   */
  private async snaffleFile(filePath: string): Promise<void> {
    if (!this.options.snaffleOutputDir) {
      return;
    }

    try {
      // Create output directory structure
      const fileName = path.basename(filePath);
      const timestamp = Date.now();
      const outputFileName = `${timestamp}_${fileName}`;
      const outputPath = path.join(this.options.snaffleOutputDir, outputFileName);

      // Ensure output directory exists
      await fs.promises.mkdir(this.options.snaffleOutputDir, { recursive: true });

      // Copy file
      await fs.promises.copyFile(filePath, outputPath);

      // Create metadata file
      const metadataPath = `${outputPath}.meta.json`;
      const metadata = {
        originalPath: filePath,
        snaffledAt: new Date().toISOString(),
        fileSize: (await fs.promises.stat(filePath)).size,
      };

      await fs.promises.writeFile(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error(`Failed to snaffle file ${filePath}:`, error);
    }
  }

  /**
   * Scan multiple files in batch
   */
  async scanFiles(
    filePaths: string[],
    sharePath?: string,
    computerName?: string
  ): Promise<FileResult[]> {
    const results: FileResult[] = [];

    for (const filePath of filePaths) {
      const result = await this.scanFile(filePath, sharePath, computerName);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Scan files with concurrency control
   */
  async scanFilesConcurrent(
    filePaths: string[],
    maxConcurrency: number = 10,
    sharePath?: string,
    computerName?: string
  ): Promise<FileResult[]> {
    const results: FileResult[] = [];
    const queue = [...filePaths];
    const inProgress: Promise<void>[] = [];

    const scanOne = async (filePath: string) => {
      const result = await this.scanFile(filePath, sharePath, computerName);
      if (result) {
        results.push(result);
      }
    };

    while (queue.length > 0 || inProgress.length > 0) {
      // Start new scans up to max concurrency
      while (queue.length > 0 && inProgress.length < maxConcurrency) {
        const filePath = queue.shift()!;
        const promise = scanOne(filePath);
        inProgress.push(promise);

        promise.finally(() => {
          const index = inProgress.indexOf(promise);
          if (index > -1) {
            inProgress.splice(index, 1);
          }
        });
      }

      // Wait for at least one to complete
      if (inProgress.length > 0) {
        await Promise.race(inProgress);
      }
    }

    return results;
  }
}
