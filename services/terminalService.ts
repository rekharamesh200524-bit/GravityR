export class TerminalService {
  private currentCommand = '';
  private onDataCallback: ((data: string) => void) | null = null;
  private currentDir = 'D:\\GravityR';

  constructor() {}

  public subscribe(callback: (data: string) => void) {
    this.onDataCallback = callback;
    // Print initial greeting
    this.write('\r\n\x1b[1;36mGravityX Integrated Shell v1.0.0\x1b[0m\r\n');
    this.write('\x1b[90mConnected to local workspace environment\x1b[0m\r\n\r\n');
    this.printPrompt();
  }

  public handleInput(data: string) {
    if (!this.onDataCallback) return;

    // Handle character input
    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      if (char === '\r') {
        // Carriage Return (Enter)
        this.write('\r\n');
        this.executeCommand(this.currentCommand.trim());
        this.currentCommand = '';
      } else if (char === '\u007F') {
        // Backspace
        if (this.currentCommand.length > 0) {
          this.currentCommand = this.currentCommand.slice(0, -1);
          // Move cursor back, write space to delete, move cursor back again
          this.write('\b \b');
        }
      } else if (char === '\u0003') {
        // Ctrl+C
        this.write('^C\r\n');
        this.currentCommand = '';
        this.printPrompt();
      } else {
        // Visible characters
        this.currentCommand += char;
        this.write(char);
      }
    }
  }

  private write(data: string) {
    if (this.onDataCallback) {
      this.onDataCallback(data);
    }
  }

  private printPrompt() {
    this.write(`\r\n\x1b[1;32mgravityx\x1b[0m \x1b[1;34m${this.currentDir}\x1b[0m\r\n$ `);
  }

  private executeCommand(cmd: string) {
    if (!cmd) {
      this.printPrompt();
      return;
    }

    const args = cmd.split(' ');
    const primary = args[0].toLowerCase();

    switch (primary) {
      case 'clear':
        this.write('\x1b[2J\x1b[H');
        break;
      case 'help':
        this.write('Available commands:\r\n');
        this.write('  help        - Display this menu\r\n');
        this.write('  clear       - Clear screen\r\n');
        this.write('  git status  - View workspace file diff status\r\n');
        this.write('  npm run dev - Launch GravityX local development compiler\r\n');
        this.write('  npm test    - Run workspace automated test suite\r\n');
        this.write('  ls / dir    - List current files\r\n');
        break;
      case 'ls':
      case 'dir':
        this.write('Mode                 LastWriteTime         Length Name\r\n');
        this.write('----                 -------------         ------ ----\r\n');
        this.write('d----          15-Jul-26   1:51 PM                app\r\n');
        this.write('d----          15-Jul-26   1:51 PM                components\r\n');
        this.write('d----          15-Jul-26   1:51 PM                features\r\n');
        this.write('-a---          15-Jul-26   1:51 PM            534 package.json\r\n');
        this.write('-a---          15-Jul-26   1:51 PM            666 tsconfig.json\r\n');
        break;
      case 'git':
        if (args[1] === 'status') {
          this.write('\x1b[33mOn branch main\x1b[0m\r\n');
          this.write('Your branch is up to date with \'origin/main\'.\r\n\r\n');
          this.write('Changes not staged for commit:\r\n');
          this.write('  (use "git add <file>..." to update what will be committed)\r\n');
          this.write('  (use "git restore <file>..." to discard changes)\r\n');
          this.write('\t\x1b[31mmodified:   app/page.tsx\x1b[0m\r\n');
          this.write('\t\x1b[31mmodified:   components/Button.tsx\x1b[0m\r\n\r\n');
          this.write('no changes added to commit (use "git add" and/or "git commit -a")\r\n');
        } else {
          this.write(`git: sub-command '${args[1]}' is not supported in this mock terminal. Try 'git status'.\r\n`);
        }
        break;
      case 'npm':
        if (args[1] === 'run' && args[2] === 'dev') {
          this.write('\x1b[36m> gravityx-frontend@0.1.0 dev\x1b[0m\r\n');
          this.write('> next dev\r\n\r\n');
          this.write('\x1b[32m▲ Next.js 15.0.0\x1b[0m\r\n');
          this.write('  - Local:        \x1b[4mhttp://localhost:3000\x1b[0m\r\n');
          this.write('  - Environments: .env.local\r\n\r\n');
          this.write('\x1b[90m[Turbopack] compiling...\x1b[0m\r\n');
          
          setTimeout(() => {
            this.write('\x1b[32m✓ Compiled in 420ms\x1b[0m (1822 modules)\r\n');
            this.write('\x1b[36m[Client] loaded client bundles successfully\x1b[0m\r\n');
          }, 1200);
          return; // Don't print prompt immediately
        } else if (args[1] === 'test') {
          this.write('\x1b[36m> gravityx-frontend@0.1.0 test\x1b[0m\r\n');
          this.write('> jest\r\n\r\n');
          this.write('\x1b[32mPASS\x1b[0m components/__tests__/Button.test.tsx\r\n');
          this.write('\x1b[32mPASS\x1b[0m stores/__tests__/chatStore.test.ts\r\n\r\n');
          this.write('Test Suites: \x1b[32m2 passed\x1b[0m, 2 total\r\n');
          this.write('Tests:       \x1b[32m8 passed\x1b[0m, 8 total\r\n');
          this.write('Snapshots:   0 total\r\n');
          this.write('Time:        1.42s\r\n');
          this.write('\x1b[90mRan all test suites.\x1b[0m\r\n');
        } else {
          this.write(`npm: command '${args.slice(1).join(' ')}' not fully configured. Try 'npm run dev' or 'npm test'.\r\n`);
        }
        break;
      default:
        this.write(`shell: command not found: ${primary}. Type 'help' to see available commands.\r\n`);
    }

    this.printPrompt();
  }
}
export const terminalService = new TerminalService();
