/**
 * Share enumeration for Windows SMB shares
 * Uses Windows APIs via Node.js child processes or native modules
 */

import { ShareInfo } from '../core/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class ShareFinder {
  /**
   * Enumerate shares on a remote computer using PowerShell/net view
   */
  async findShares(computerName: string): Promise<ShareInfo[]> {
    const shares: ShareInfo[] = [];

    try {
      // Try PowerShell first (more reliable)
      const psShares = await this.findSharesPowerShell(computerName);
      if (psShares.length > 0) {
        return psShares;
      }

      // Fallback to net view
      return await this.findSharesNetView(computerName);
    } catch (error) {
      console.error(`Failed to enumerate shares on ${computerName}:`, error);
      return shares;
    }
  }

  /**
   * Enumerate shares using PowerShell
   */
  private async findSharesPowerShell(computerName: string): Promise<ShareInfo[]> {
    const shares: ShareInfo[] = [];

    try {
      // PowerShell command to get shares
      const psCommand = `Get-WmiObject -Class Win32_Share -ComputerName "${computerName}" | Select-Object Name,Path,Type | ConvertTo-Json`;

      const { stdout } = await execAsync(`powershell.exe -Command "${psCommand}"`, {
        timeout: 30000,
      });

      if (!stdout.trim()) {
        return shares;
      }

      let shareData;
      try {
        shareData = JSON.parse(stdout);
      } catch {
        return shares;
      }

      // Handle single share (not an array)
      if (!Array.isArray(shareData)) {
        shareData = [shareData];
      }

      for (const share of shareData) {
        if (!share.Name) continue;

        const sharePath = `\\\\${computerName}\\${share.Name}`;
        const accessible = await this.testShareAccess(sharePath);

        shares.push({
          computerName,
          shareName: share.Name,
          sharePath,
          shareType: share.Type || 0,
          accessible,
        });
      }
    } catch (error) {
      // PowerShell failed, will try net view
    }

    return shares;
  }

  /**
   * Enumerate shares using net view command (fallback)
   */
  private async findSharesNetView(computerName: string): Promise<ShareInfo[]> {
    const shares: ShareInfo[] = [];

    try {
      const { stdout } = await execAsync(`net view \\\\${computerName}`, {
        timeout: 30000,
      });

      const lines = stdout.split('\n');
      let inShareList = false;

      for (const line of lines) {
        // Start of share list
        if (line.includes('Share name')) {
          inShareList = true;
          continue;
        }

        // End of share list
        if (line.includes('The command completed')) {
          break;
        }

        if (!inShareList || !line.trim()) {
          continue;
        }

        // Parse share line (format: "ShareName       Type   Comment")
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length < 2) continue;

        const shareName = parts[0].trim();
        if (!shareName || shareName.startsWith('-')) continue;

        const sharePath = `\\\\${computerName}\\${shareName}`;
        const accessible = await this.testShareAccess(sharePath);

        shares.push({
          computerName,
          shareName,
          sharePath,
          shareType: 0, // Unknown type from net view
          accessible,
        });
      }
    } catch (error) {
      // net view failed
    }

    return shares;
  }

  /**
   * Test if a share is accessible
   */
  private async testShareAccess(sharePath: string): Promise<boolean> {
    try {
      await fs.promises.access(sharePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find all shares on multiple computers in parallel
   */
  async findSharesBulk(
    computerNames: string[],
    maxConcurrency: number = 10
  ): Promise<Map<string, ShareInfo[]>> {
    const results = new Map<string, ShareInfo[]>();
    const queue = [...computerNames];
    const inProgress: Promise<void>[] = [];

    const processComputer = async (computerName: string) => {
      const shares = await this.findShares(computerName);
      results.set(computerName, shares);
    };

    while (queue.length > 0 || inProgress.length > 0) {
      // Start new tasks up to max concurrency
      while (queue.length > 0 && inProgress.length < maxConcurrency) {
        const computerName = queue.shift()!;
        const promise = processComputer(computerName);
        inProgress.push(promise);

        // Remove from inProgress when done
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

  /**
   * Find local shares on the current machine
   */
  async findLocalShares(): Promise<ShareInfo[]> {
    return this.findShares('localhost');
  }

  /**
   * Check if a share is a default administrative share (C$, ADMIN$, IPC$, etc.)
   */
  static isAdminShare(shareName: string): boolean {
    const adminShares = ['C$', 'D$', 'E$', 'ADMIN$', 'IPC$', 'PRINT$'];
    return adminShares.includes(shareName.toUpperCase());
  }

  /**
   * Check if a share is a special system share (SYSVOL, NETLOGON)
   */
  static isSystemShare(shareName: string): boolean {
    const systemShares = ['SYSVOL', 'NETLOGON'];
    return systemShares.some(s => shareName.toUpperCase() === s);
  }

  /**
   * Filter shares based on common criteria
   */
  static filterShares(
    shares: ShareInfo[],
    options: {
      excludeAdmin?: boolean;
      excludeInaccessible?: boolean;
      includeSystemShares?: boolean;
    } = {}
  ): ShareInfo[] {
    return shares.filter(share => {
      // Exclude inaccessible shares
      if (options.excludeInaccessible && !share.accessible) {
        return false;
      }

      // Exclude admin shares
      if (options.excludeAdmin && ShareFinder.isAdminShare(share.shareName)) {
        return false;
      }

      // Filter system shares
      if (!options.includeSystemShares && ShareFinder.isSystemShare(share.shareName)) {
        return false;
      }

      return true;
    });
  }
}
