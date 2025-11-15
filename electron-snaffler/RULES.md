# Snaffler Rules - Complete Port

All **95 rules** from the original Snaffler (across 87 TOML files) have been successfully ported to JSON format for use in Electron-Snaffler.

## Rule Organization

Rules are organized into 6 category files for easier management:

### 1. **code-rules.json** (43 rules)
Rules for finding sensitive data in code files across multiple programming languages.

**Languages Covered:**
- **C# / ASP.NET**: Database connection strings, ViewState keys, config files
- **PowerShell**: Credentials, secure strings, history files
- **Python**: Database connections (MySQL, PostgreSQL)
- **PHP**: Database connections, configuration files
- **Java**: JDBC connections, database credentials
- **Ruby**: Database configs, Rails secrets, Chef/Knife configs
- **JavaScript/TypeScript**: Generic code patterns
- **Perl**: DBI connections
- **Batch/CMD**: Passwords in scripts, scheduled tasks, PsExec
- **VBScript**: Credentials and connection strings
- **Shell Scripts**: Bash history, rc files, exports

**Generic Patterns:**
- AWS access keys (AKIA*, regex patterns)
- Private keys (RSA, DSA, ECDSA, OpenSSH)
- Passwords and API keys in code
- Slack tokens and webhooks
- SQL account creation statements
- S3 URI prefixes
- Connection string passwords
- Generic config files (YAML, JSON, XML, TOML, INI, ENV)

### 2. **infrastructure-rules.json** (26 rules)
Rules for infrastructure-related files and configurations.

**Categories:**
- **Certificates**: PEM, DER, PFX, PKCS12 (checked for private keys)
- **Databases**: MDF, SDF, SQL dumps, backups
- **CI/CD**: Jenkins credentials, SSH publisher configs
- **Deployment Automation**:
  - Windows deployment images (WIM, OVA, OVF)
  - Unattend.xml files with admin passwords
  - Domain join credentials (customsettings.ini)
  - SCCM boot variables and policies
  - Windows Defender configurations
- **FTP Servers**: ProFTPD, FileZilla configs
- **Infrastructure as Code**: Azure configs (CSCFG), Cisco UCS, Terraform
- **Memory Dumps**: DMP files, MEMORY.DMP, hiberfil.sys, lsass dumps
- **Network Devices**: Cisco configs, router/switch/firewall configs
- **Kerberos**: Keytabs, credential caches (CCACHE, krb5cc)
- **Local Hashes**:
  - Windows: NTDS.DIT, SAM, SYSTEM, SECURITY
  - Unix: /etc/shadow, /etc/passwd, pwd.db
- **PAM/Password Vaults**: CyberArk configs and credential files
- **Packet Captures**: PCAP, PCAPNG files

### 3. **userfiles-rules.json** (20 rules)
Rules for user-specific files containing credentials and sensitive data.

**Categories:**
- **SSH Keys**: id_rsa, id_dsa, id_ecdsa, id_ed25519, PPK files, .ssh/ directories
- **Password Managers**: KeePass (KDBX), Password Safe, KWallet, macOS Keychain
- **Password Files**: passwords.txt, passwords.xlsx, secrets files
- **Cloud API Keys**: AWS credentials, DigitalOcean (tugboat), .aws/ directory
- **Browser Credentials**: Firefox logins.json with encrypted passwords
- **Database Management Tools**:
  - SQL Studio configs
  - MySQL/PostgreSQL history
  - DBeaver data sources
  - DBVisualizer configs
  - Robo 3T (formerly Robomongo)
- **Version Control**: .git-credentials
- **Shell History**: bash_history, zsh_history, PowerShell history
- **Shell RC Files**: .bashrc, .zshrc, .profile, .npmrc, .env
- **Remote Access**:
  - RDP files with passwords
  - MobaXterm configs
  - Remote Desktop Gateway (RDG)
  - OpenVPN configs
  - TeamViewer options
- **FTP Clients**: FileZilla recent servers, SFTP configs
- **Business Documents**: Files with "password", "secret", "credential" in name

### 4. **discard-rules.json** (4 rules)
Rules to filter out noise and false positives.

**File Extensions to Skip:**
- Images: BMP, GIF, JPG, PNG, SVG, TIFF, WebP
- Fonts: TTF, OTF
- Web: CSS, LESS
- Schemas: XSD, XSL, ADMX, ADML

**Specific Files to Skip:**
- jmxremote.password.template (template file, not actual credentials)
- sceregvl.inf (system file)

**Post-Match Filters:**
- PsExec/PsPasswd executables (tools, not credentials)
- Windows SDK paths
- Git internal paths
- SQL Server template directories

### 5. **path-rules.json** (2 rules)
Rules to skip entire directory trees that generate false positives.

**Windows System Directories:**
- \winsxs, \system32, \syswow64
- \Windows\servicing, \Windows\diagnostics
- .NET Framework directories
- Windows assembly cache
- Microsoft AppData paths
- Teams/Windows app data

**Development/Package Directories:**
- node_modules, vendor/bundle, vendor/cache
- Python lib directories, Anaconda test directories
- Ruby library paths
- PowerShell modules
- .NET SDK and shared directories
- Documentation directories

### 6. **share-rules.json** (3 rules)
Rules for filtering SMB network shares.

**Shares to Discard:**
- IPC$ (Inter-process communication)
- PRINT$ (Printer shares)

**Shares to Flag:**
- C$ / ADMIN$ - Admin shares (flagged as Black - accessible but noisy)
- SCCMContentLib$ - SCCM content library (Yellow - interesting for CMLoot)

## Rule Statistics

| Category | Rules | Purpose |
|----------|-------|---------|
| Code | 43 | Find credentials in source code |
| Infrastructure | 26 | System configs, certificates, hashes |
| User Files | 20 | SSH keys, passwords, API keys |
| Discard | 4 | Filter false positives |
| Path | 2 | Skip noisy directories |
| Share | 3 | Filter network shares |
| **TOTAL** | **95** | **Complete rule coverage** |

## Triage Levels Distribution

- **Black** (Highest Value): 14 rules
  - Examples: NTDS.DIT, SAM, SSH private keys, admin shares, password managers

- **Red** (High Interest): 45 rules
  - Examples: Passwords in code, AWS keys, database credentials, certificates with private keys

- **Yellow** (Medium Interest): 12 rules
  - Examples: Config files, connection strings, Kerberos tickets, PCAP files

- **Green** (Low Interest): 24 rules
  - Examples: Shell history, relay rules, general config files

## Key Features Maintained

✅ **Pattern Matching Types:**
- Exact match
- Contains (substring)
- StartsWith / EndsWith
- Regular expressions

✅ **Match Locations:**
- File name
- File extension
- File path
- File contents (text)
- File contents (binary)
- Share name
- Directory path

✅ **Actions:**
- `Snaffle` - Copy file to output directory
- `Relay` - Pass to another rule for deeper analysis
- `Discard` - Skip/ignore
- `CheckForKeys` - Parse certificates for private keys

✅ **Rule Chaining:**
- Relay rules chain to content analysis rules
- Example: .ps1 files relay to PowerShell credential patterns

## Usage in Electron-Snaffler

```typescript
import { RuleLoader } from './rules/RuleLoader';
import { ClassifierEngine } from './classifiers/ClassifierEngine';

// Load all default rules
const ruleLoader = new RuleLoader();
ruleLoader.loadFromDirectory('./src/rules/default-rules');

// Create classifier with all rules
const rules = ruleLoader.getRules();
const classifier = new ClassifierEngine(rules);

// Use in scanning
const fileResult = classifier.classifyFile('/path/to/passwords.txt');
// Result: { matched: true, triage: 'Red', action: 'Snaffle', ... }
```

## Differences from Original

1. **Format**: JSON instead of TOML (easier to parse in JavaScript)
2. **Organization**: 6 category files instead of 87 separate files
3. **Regex Escaping**: Adjusted for JavaScript RegExp syntax
4. **File Extensions**: Leading dots removed (e.g., "ps1" instead of ".ps1")

All rule logic, patterns, and triage levels remain identical to the original Snaffler.

## Adding Custom Rules

You can add your own rules to any category file or create new files:

```json
{
  "ClassifierRules": [
    {
      "RuleName": "KeepMyCompanySecrets",
      "Description": "Company-specific sensitive files",
      "EnumerationScope": "FileEnumeration",
      "MatchLocation": "FileName",
      "WordListType": "Contains",
      "WordList": ["CONFIDENTIAL", "INTERNAL", "PROPRIETARY"],
      "MatchAction": "Snaffle",
      "Triage": "Red"
    }
  ]
}
```

## Rule Sources

All rules were ported from:
- Original Snaffler repository: https://github.com/SnaffCon/Snaffler
- Path: `Snaffler/SnaffRules/DefaultRules/`
- Original format: TOML
- Converted: 2024

## Credits

Rules originally created by the Snaffler team (@SnaffCon).
Ported to JSON for Electron-Snaffler integration.
