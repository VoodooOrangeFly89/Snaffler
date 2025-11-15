/**
 * Recursive directory tree walker
 * Enumerates files and directories with filtering
 */

import * as fs from 'fs';
import * as path from 'path';
import { ClassifierEngine } from '../classifiers/ClassifierEngine';
import { MatchAction } from '../core/types';

export interface TreeWalkOptions {
  maxDepth?: number;
  followSymlinks?: boolean;
  ignoreErrors?: boolean;
  classifier?: ClassifierEngine;
}

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  modifiedTime: Date;
}

export class TreeWalker {
  private options: TreeWalkOptions;
  private stats = {
    directoriesScanned: 0,
    filesFound: 0,
    errorsEncountered: 0,
  };

  constructor(options: TreeWalkOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth,
      followSymlinks: options.followSymlinks ?? false,
      ignoreErrors: options.ignoreErrors ?? true,
      classifier: options.classifier,
    };
  }

  /**
   * Walk a directory tree and yield files
   */
  async *walk(rootPath: string, depth: number = 0): AsyncGenerator<FileEntry> {
    // Check max depth
    if (this.options.maxDepth !== undefined && depth > this.options.maxDepth) {
      return;
    }

    let entries: fs.Dirent[];

    try {
      entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      this.stats.errorsEncountered++;
      if (!this.options.ignoreErrors) {
        throw error;
      }
      return;
    }

    this.stats.directoriesScanned++;

    for (const entry of entries) {
      const fullPath = path.join(rootPath, entry.name);

      // Handle symlinks
      if (entry.isSymbolicLink() && !this.options.followSymlinks) {
        continue;
      }

      try {
        let stats: fs.Stats;

        if (entry.isSymbolicLink() && this.options.followSymlinks) {
          stats = await fs.promises.stat(fullPath);
        } else {
          stats = await fs.promises.lstat(fullPath);
        }

        if (stats.isDirectory()) {
          // Check if directory should be scanned
          if (this.options.classifier) {
            const result = this.options.classifier.classifyDirectory(fullPath);
            if (result.action === MatchAction.Discard) {
              continue; // Skip this directory
            }
          }

          // Recursively walk subdirectory
          yield* this.walk(fullPath, depth + 1);
        } else if (stats.isFile()) {
          this.stats.filesFound++;

          yield {
            path: fullPath,
            name: entry.name,
            size: stats.size,
            isDirectory: false,
            modifiedTime: stats.mtime,
          };
        }
      } catch (error) {
        this.stats.errorsEncountered++;
        if (!this.options.ignoreErrors) {
          throw error;
        }
        continue;
      }
    }
  }

  /**
   * Get all files in a directory tree (non-streaming)
   */
  async getAllFiles(rootPath: string): Promise<FileEntry[]> {
    const files: FileEntry[] = [];

    for await (const file of this.walk(rootPath)) {
      files.push(file);
    }

    return files;
  }

  /**
   * Walk multiple root paths
   */
  async *walkMultiple(rootPaths: string[]): AsyncGenerator<FileEntry> {
    for (const rootPath of rootPaths) {
      yield* this.walk(rootPath);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      directoriesScanned: 0,
      filesFound: 0,
      errorsEncountered: 0,
    };
  }

  /**
   * Filter files by classifier rules
   */
  async *walkWithClassifier(
    rootPath: string,
    classifier: ClassifierEngine
  ): AsyncGenerator<FileEntry> {
    for await (const file of this.walk(rootPath)) {
      const result = classifier.classifyFile(file.path);

      // Only yield files that match and should be processed
      if (result.matched && result.action !== MatchAction.Discard) {
        yield file;
      }
    }
  }

  /**
   * Test if a path is accessible
   */
  static async isAccessible(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get directory size (total size of all files)
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    const walker = new TreeWalker({ ignoreErrors: true });

    for await (const file of walker.walk(dirPath)) {
      totalSize += file.size;
    }

    return totalSize;
  }
}
