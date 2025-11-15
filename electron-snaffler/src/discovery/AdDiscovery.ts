/**
 * Active Directory discovery using LDAP queries
 * Finds computers and domain controllers in the domain
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ComputerInfo {
  name: string;
  dnshostname?: string;
  operatingSystem?: string;
  description?: string;
}

export interface DomainInfo {
  name: string;
  domainController?: string;
  forestName?: string;
}

export class AdDiscovery {
  private domain?: string;
  private domainController?: string;

  constructor(domain?: string, domainController?: string) {
    this.domain = domain;
    this.domainController = domainController;
  }

  /**
   * Get the current domain information
   */
  async getDomainInfo(): Promise<DomainInfo | null> {
    try {
      // Use PowerShell to get domain info
      const psCommand = `
        $domain = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
        @{
          Name = $domain.Name
          DomainController = $domain.PdcRoleOwner.Name
          ForestName = $domain.Forest.Name
        } | ConvertTo-Json
      `;

      const { stdout } = await execAsync(`powershell.exe -Command "${psCommand}"`, {
        timeout: 10000,
      });

      const domainInfo = JSON.parse(stdout);
      return {
        name: domainInfo.Name,
        domainController: domainInfo.DomainController,
        forestName: domainInfo.ForestName,
      };
    } catch (error) {
      console.error('Failed to get domain info:', error);
      return null;
    }
  }

  /**
   * Find all computers in the domain using PowerShell/LDAP
   */
  async findComputers(ldapFilter?: string): Promise<ComputerInfo[]> {
    try {
      // Default LDAP filter for computers
      const filter = ldapFilter || '(objectClass=computer)';

      const psCommand = `
        $searcher = New-Object System.DirectoryServices.DirectorySearcher
        $searcher.Filter = "${filter}"
        $searcher.PropertiesToLoad.AddRange(@("name","dnshostname","operatingSystem","description"))
        $searcher.PageSize = 1000
        $results = $searcher.FindAll()

        $computers = @()
        foreach ($result in $results) {
          $computers += @{
            Name = $result.Properties["name"][0]
            DnsHostName = $result.Properties["dnshostname"][0]
            OperatingSystem = $result.Properties["operatingSystem"][0]
            Description = $result.Properties["description"][0]
          }
        }

        $computers | ConvertTo-Json
      `;

      const { stdout } = await execAsync(`powershell.exe -Command "${psCommand}"`, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large results
      });

      if (!stdout.trim()) {
        return [];
      }

      let computerData = JSON.parse(stdout);

      // Handle single result (not an array)
      if (!Array.isArray(computerData)) {
        computerData = [computerData];
      }

      return computerData.map((c: any) => ({
        name: c.Name,
        dnshostname: c.DnsHostName,
        operatingSystem: c.OperatingSystem,
        description: c.Description,
      }));
    } catch (error) {
      console.error('Failed to find computers:', error);
      return [];
    }
  }

  /**
   * Find domain controllers
   */
  async findDomainControllers(): Promise<ComputerInfo[]> {
    const filter = '(&(objectClass=computer)(userAccountControl:1.2.840.113556.1.4.803:=8192))';
    return this.findComputers(filter);
  }

  /**
   * Find servers (non-workstation computers)
   */
  async findServers(): Promise<ComputerInfo[]> {
    const filter = '(&(objectClass=computer)(operatingSystem=*Server*))';
    return this.findComputers(filter);
  }

  /**
   * Find workstations
   */
  async findWorkstations(): Promise<ComputerInfo[]> {
    const filter = '(&(objectClass=computer)(!(operatingSystem=*Server*)))';
    return this.findComputers(filter);
  }

  /**
   * Test if AD is available
   */
  async isAdAvailable(): Promise<boolean> {
    try {
      const domainInfo = await this.getDomainInfo();
      return domainInfo !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get DFS shares/namespaces (simplified)
   */
  async findDfsShares(): Promise<string[]> {
    try {
      const psCommand = `
        Get-DfsnRoot | Select-Object -ExpandProperty Path
      `;

      const { stdout } = await execAsync(`powershell.exe -Command "${psCommand}"`, {
        timeout: 30000,
      });

      return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (error) {
      console.error('Failed to find DFS shares:', error);
      return [];
    }
  }

  /**
   * Resolve a computer name to IP address
   */
  async resolveComputerName(computerName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`nslookup ${computerName}`, {
        timeout: 5000,
      });

      // Parse nslookup output for IP address
      const match = stdout.match(/Address:\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        return match[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Filter computers by operating system
   */
  static filterByOS(computers: ComputerInfo[], osPattern: string): ComputerInfo[] {
    const regex = new RegExp(osPattern, 'i');
    return computers.filter(c => c.operatingSystem && regex.test(c.operatingSystem));
  }

  /**
   * Get unique computer names (removes duplicates)
   */
  static getUniqueNames(computers: ComputerInfo[]): string[] {
    const names = new Set<string>();

    for (const computer of computers) {
      if (computer.dnshostname) {
        names.add(computer.dnshostname);
      } else if (computer.name) {
        names.add(computer.name);
      }
    }

    return Array.from(names);
  }
}
