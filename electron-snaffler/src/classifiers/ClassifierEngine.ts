/**
 * Classifier engine for matching files, shares, and content against rules
 */

import {
  ClassifierRule,
  EnumerationScope,
  MatchAction,
  MatchLocation,
  TriageLevel,
  WordListType,
  FileResult,
} from '../core/types';
import * as path from 'path';

export interface MatchResult {
  matched: boolean;
  rule?: ClassifierRule;
  matchedString?: string;
  action: MatchAction;
  triage?: TriageLevel;
}

export class ClassifierEngine {
  private rules: ClassifierRule[];

  constructor(rules: ClassifierRule[]) {
    this.rules = rules;
  }

  /**
   * Classify a share name
   */
  classifyShare(shareName: string, computerName: string): MatchResult {
    const shareRules = this.rules.filter(
      rule => rule.EnumerationScope === EnumerationScope.ShareEnumeration
    );

    for (const rule of shareRules) {
      if (rule.MatchLocation === MatchLocation.ShareName) {
        const match = this.matchWordList(shareName, rule.WordList, rule.WordListType);
        if (match.matched) {
          return {
            matched: true,
            rule,
            matchedString: match.matchedValue,
            action: rule.MatchAction,
            triage: rule.Triage,
          };
        }
      }
    }

    // Default: allow scanning
    return { matched: false, action: MatchAction.Relay };
  }

  /**
   * Classify a directory path
   */
  classifyDirectory(directoryPath: string): MatchResult {
    const dirRules = this.rules.filter(
      rule => rule.EnumerationScope === EnumerationScope.DirectoryEnumeration
    );

    for (const rule of dirRules) {
      if (rule.MatchLocation === MatchLocation.DirectoryPath) {
        const match = this.matchWordList(directoryPath, rule.WordList, rule.WordListType);
        if (match.matched) {
          return {
            matched: true,
            rule,
            matchedString: match.matchedValue,
            action: rule.MatchAction,
            triage: rule.Triage,
          };
        }
      }
    }

    // Default: allow scanning
    return { matched: false, action: MatchAction.Relay };
  }

  /**
   * Classify a file (by name/extension/path)
   */
  classifyFile(filePath: string): MatchResult {
    const fileRules = this.rules.filter(
      rule => rule.EnumerationScope === EnumerationScope.FileEnumeration
    );

    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const fileNameWithoutExt = path.basename(filePath, fileExt);

    for (const rule of fileRules) {
      let testString = '';

      switch (rule.MatchLocation) {
        case MatchLocation.FileName:
          testString = fileName;
          break;
        case MatchLocation.FileExtension:
          testString = fileExt.replace(/^\./, ''); // Remove leading dot
          break;
        case MatchLocation.FilePath:
          testString = filePath;
          break;
        default:
          continue;
      }

      const match = this.matchWordList(testString, rule.WordList, rule.WordListType);
      if (match.matched) {
        return {
          matched: true,
          rule,
          matchedString: match.matchedValue,
          action: rule.MatchAction,
          triage: rule.Triage,
        };
      }
    }

    // Default: discard unless matched
    return { matched: false, action: MatchAction.Discard };
  }

  /**
   * Classify file contents
   */
  classifyFileContents(
    filePath: string,
    content: string | Buffer,
    isBuffer: boolean = false
  ): MatchResult[] {
    const contentRules = this.rules.filter(
      rule => rule.EnumerationScope === EnumerationScope.ContentsEnumeration
    );

    const results: MatchResult[] = [];

    for (const rule of contentRules) {
      let testData: string | Buffer;
      let shouldTest = false;

      if (rule.MatchLocation === MatchLocation.FileContentAsString && !isBuffer) {
        testData = content as string;
        shouldTest = true;
      } else if (rule.MatchLocation === MatchLocation.FileContentAsBytes && isBuffer) {
        testData = content as Buffer;
        shouldTest = true;
      }

      if (!shouldTest) continue;

      if (typeof testData === 'string') {
        const match = this.matchWordList(testData, rule.WordList, rule.WordListType);
        if (match.matched) {
          results.push({
            matched: true,
            rule,
            matchedString: match.matchedValue,
            action: rule.MatchAction,
            triage: rule.Triage,
          });
        }
      } else if (Buffer.isBuffer(testData)) {
        // For byte content, convert patterns to buffers
        for (const pattern of rule.WordList) {
          if (this.matchBytesInBuffer(testData, pattern)) {
            results.push({
              matched: true,
              rule,
              matchedString: pattern,
              action: rule.MatchAction,
              triage: rule.Triage,
            });
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Match a string against a word list
   */
  private matchWordList(
    testString: string,
    wordList: string[],
    matchType: WordListType
  ): { matched: boolean; matchedValue?: string } {
    for (const word of wordList) {
      let matched = false;

      switch (matchType) {
        case WordListType.Exact:
          matched = testString.toLowerCase() === word.toLowerCase();
          break;

        case WordListType.Contains:
          matched = testString.toLowerCase().includes(word.toLowerCase());
          break;

        case WordListType.StartsWith:
          matched = testString.toLowerCase().startsWith(word.toLowerCase());
          break;

        case WordListType.EndsWith:
          matched = testString.toLowerCase().endsWith(word.toLowerCase());
          break;

        case WordListType.Regex:
          try {
            const regex = new RegExp(word, 'i'); // Case-insensitive
            matched = regex.test(testString);
          } catch (error) {
            console.error(`Invalid regex pattern: ${word}`, error);
          }
          break;
      }

      if (matched) {
        return { matched: true, matchedValue: word };
      }
    }

    return { matched: false };
  }

  /**
   * Match byte patterns in a buffer
   */
  private matchBytesInBuffer(buffer: Buffer, hexPattern: string): boolean {
    // Convert hex pattern to buffer
    // Example: "CAFEBABE" -> Buffer
    try {
      const patternBuffer = Buffer.from(hexPattern.replace(/\s/g, ''), 'hex');
      return buffer.includes(patternBuffer);
    } catch (error) {
      // Try as regular string
      return buffer.includes(Buffer.from(hexPattern));
    }
  }

  /**
   * Get highest triage level from multiple matches
   */
  static getHighestTriage(results: MatchResult[]): TriageLevel {
    const order = [
      TriageLevel.Black,
      TriageLevel.Green,
      TriageLevel.Yellow,
      TriageLevel.Red,
    ];

    let highest = TriageLevel.Black;

    for (const result of results) {
      if (result.triage) {
        const currentIndex = order.indexOf(result.triage);
        const highestIndex = order.indexOf(highest);

        if (currentIndex > highestIndex) {
          highest = result.triage;
        }
      }
    }

    return highest;
  }

  /**
   * Extract context around a match in content
   */
  static extractMatchContext(
    content: string,
    matchedString: string,
    contextBytes: number = 200
  ): string {
    const index = content.toLowerCase().indexOf(matchedString.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextBytes);
    const end = Math.min(content.length, index + matchedString.length + contextBytes);

    let context = content.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';

    return context;
  }
}
