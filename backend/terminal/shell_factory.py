import os
import sys
import shutil

class ShellFactory:
    @staticmethod
    def get_shell_config(shell_type: str = None) -> tuple[str, str]:
        """
        Returns a tuple of (executable_path, args_string) for the specified shell_type.
        """
        print(f"ShellFactory: Resolving configuration for requested shell_type: '{shell_type}'")
        platform = sys.platform
        
        if platform == "win32":
            requested = shell_type.lower() if shell_type else None
            system_root = os.environ.get("SystemRoot", "C:\\Windows")
            
            def find_powershell():
                pwsh_path = os.path.join(system_root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
                if os.path.exists(pwsh_path):
                    return pwsh_path
                which_ps = shutil.which("powershell.exe")
                if which_ps:
                    return which_ps
                return None

            def find_cmd():
                cmd_path = os.path.join(system_root, "System32", "cmd.exe")
                if os.path.exists(cmd_path):
                    return cmd_path
                which_cmd = shutil.which("cmd.exe")
                if which_cmd:
                    return which_cmd
                return None

            def find_git_bash():
                paths = [
                    r"C:\Program Files\Git\bin\bash.exe",
                    r"C:\Program Files (x86)\Git\bin\bash.exe",
                    os.path.expandvars(r"%LocalAppData%\Programs\Git\bin\bash.exe"),
                ]
                for p in paths:
                    if os.path.exists(p):
                        return p
                which_bash = shutil.which("bash.exe") or shutil.which("bash")
                if which_bash and "git" in which_bash.lower():
                    return which_bash
                return None

            # Definition of available shells in fallback order
            fallbacks = [
                ("powershell", find_powershell, ""),
                ("cmd", find_cmd, ""),
                ("git_bash", find_git_bash, "--login -i")
            ]

            # If user explicitly requested a shell
            if requested:
                if "powershell" in requested:
                    path = find_powershell()
                    if path:
                        print(f"ShellFactory: Resolved explicitly requested PowerShell -> '{path}'")
                        return path, ""
                    raise FileNotFoundError("PowerShell executable (powershell.exe) not found.")
                elif "cmd" in requested:
                    path = find_cmd()
                    if path:
                        print(f"ShellFactory: Resolved explicitly requested CMD -> '{path}'")
                        return path, ""
                    raise FileNotFoundError("CMD executable (cmd.exe) not found.")
                elif requested in ("git_bash", "git bash", "bash"):
                    path = find_git_bash()
                    if path:
                        print(f"ShellFactory: Resolved explicitly requested Git Bash -> '{path}'")
                        return path, "--login -i"
                    raise FileNotFoundError("Git Bash executable (bash.exe) not found.")
            
            # If no shell is specified or requested fallback fails, try default order
            for name, finder, args in fallbacks:
                path = finder()
                if path:
                    print(f"ShellFactory: Resolved default fallback shell '{name}' -> '{path}'")
                    return path, args
            
            raise FileNotFoundError("No supported shells (PowerShell, CMD, Git Bash) found on the system.")
        
        elif platform == "darwin":
            if not shell_type:
                shell_type = "zsh"
            zsh_path = shutil.which("zsh") or "/bin/zsh"
            return zsh_path, ""
            
        else:
            if not shell_type:
                shell_type = "bash"
            bash_path = shutil.which("bash") or "/bin/bash"
            return bash_path, ""
