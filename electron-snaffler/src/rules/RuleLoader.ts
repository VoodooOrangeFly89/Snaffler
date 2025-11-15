/**
 * Rule loading and parsing system
 * Supports both TOML (original format) and JSON rules
 */

import {
  ClassifierRule,
  EnumerationScope,
  MatchAction,
  MatchLocation,
  TriageLevel,
  WordListType,
} from '../core/types';
import * as fs from 'fs';
import * as path from 'path';

export class RuleLoader {
  private rules: ClassifierRule[] = [];

  /**
   * Load rules from a directory
   * Supports both .toml and .json files
   */
  loadFromDirectory(directoryPath: string): void {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Rule directory does not exist: ${directoryPath}`);
    }

    const files = this.getFilesRecursive(directoryPath);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();

      if (ext === '.json') {
        this.loadJSONFile(file);
      } else if (ext === '.toml') {
        this.loadTOMLFile(file);
      }
    }
  }

  /**
   * Load rules from a JSON file
   */
  private loadJSONFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (Array.isArray(data.ClassifierRules)) {
        for (const rule of data.ClassifierRules) {
          this.addRule(this.parseRule(rule));
        }
      }
    } catch (error) {
      console.error(`Failed to load JSON rule file ${filePath}:`, error);
    }
  }

  /**
   * Load rules from a TOML file (simplified parser)
   * For full TOML support, use a library like @iarna/toml or smol-toml
   */
  private loadTOMLFile(filePath: string): void {
    try {
      // For now, we'll use a simple TOML parser
      // In production, use: import * as TOML from '@iarna/toml';
      const content = fs.readFileSync(filePath, 'utf-8');
      const rules = this.parseTOMLSimple(content);

      for (const rule of rules) {
        this.addRule(rule);
      }
    } catch (error) {
      console.error(`Failed to load TOML rule file ${filePath}:`, error);
    }
  }

  /**
   * Simplified TOML parser for ClassifierRules
   * This is a basic implementation - for production use a proper TOML library
   */
  private parseTOMLSimple(content: string): ClassifierRule[] {
    const rules: ClassifierRule[] = [];
    const ruleBlocks = content.split('[[ClassifierRules]]').slice(1);

    for (const block of ruleBlocks) {
      const rule: any = {};
      const lines = block.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
        if (!match) continue;

        const [, key, value] = match;
        rule[key] = this.parseTOMLValue(value);
      }

      if (rule.RuleName) {
        try {
          rules.push(this.parseRule(rule));
        } catch (error) {
          console.error(`Failed to parse rule from TOML:`, error);
        }
      }
    }

    return rules;
  }

  /**
   * Parse TOML value (string, array, etc.)
   */
  private parseTOMLValue(value: string): any {
    value = value.trim();

    // Array
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value.slice(1, -1).split(',');
      return items.map(item => {
        const trimmed = item.trim();
        // Remove quotes
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
          return trimmed.slice(1, -1);
        }
        return trimmed;
      });
    }

    // String
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    if (!isNaN(Number(value))) return Number(value);

    return value;
  }

  /**
   * Parse and validate a rule object
   */
  private parseRule(ruleObj: any): ClassifierRule {
    // Validate required fields
    if (!ruleObj.RuleName || !ruleObj.EnumerationScope || !ruleObj.MatchAction ||
        !ruleObj.MatchLocation || !ruleObj.WordListType || !ruleObj.Triage) {
      throw new Error('Rule missing required fields');
    }

    // Ensure WordList is an array
    let wordList = ruleObj.WordList;
    if (!Array.isArray(wordList)) {
      wordList = [wordList];
    }

    const rule: ClassifierRule = {
      RuleName: ruleObj.RuleName,
      EnumerationScope: ruleObj.EnumerationScope as EnumerationScope,
      MatchAction: ruleObj.MatchAction as MatchAction,
      MatchLocation: ruleObj.MatchLocation as MatchLocation,
      WordListType: ruleObj.WordListType as WordListType,
      WordList: wordList,
      Triage: ruleObj.Triage as TriageLevel,
      RelayTargets: ruleObj.RelayTargets,
      Description: ruleObj.Description,
    };

    return rule;
  }

  /**
   * Add a rule to the collection
   */
  addRule(rule: ClassifierRule): void {
    this.rules.push(rule);
  }

  /**
   * Get all loaded rules
   */
  getRules(): ClassifierRule[] {
    return [...this.rules];
  }

  /**
   * Get rules by enumeration scope
   */
  getRulesByScope(scope: EnumerationScope): ClassifierRule[] {
    return this.rules.filter(rule => rule.EnumerationScope === scope);
  }

  /**
   * Get rule by name
   */
  getRuleByName(name: string): ClassifierRule | undefined {
    return this.rules.find(rule => rule.RuleName === name);
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules = [];
  }

  /**
   * Get files recursively from a directory
   */
  private getFilesRecursive(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.getFilesRecursive(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Export rules to JSON format
   */
  exportToJSON(outputPath: string): void {
    const data = {
      ClassifierRules: this.rules,
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
