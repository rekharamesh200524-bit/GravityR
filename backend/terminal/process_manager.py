import os
import sys
import subprocess
import signal

class ProcessManager:
    def __init__(self):
        self.active_pids = set()

    def register_process(self, pid: int):
        self.active_pids.add(pid)

    def unregister_process(self, pid: int):
        if pid in self.active_pids:
            self.active_pids.remove(pid)

    def terminate_process_tree(self, pid: int):
        """
        Forcefully terminates a process and all of its descendants.
        """
        if not pid:
            return
            
        if sys.platform == "win32":
            try:
                # /F forceful, /T tree kill (child processes), /PID process id
                subprocess.run(
                    f"taskkill /F /T /PID {pid}",
                    shell=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Error terminating process tree on Windows for PID {pid}: {e}")
        else:
            try:
                # Send SIGKILL to the process group
                os.killpg(os.getpgid(pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            except Exception as e:
                import traceback
                traceback.print_exc()
                try:
                    os.kill(pid, signal.SIGKILL)
                except Exception:
                    pass
                print(f"Error terminating process tree on Unix for PID {pid}: {e}")
        
        self.unregister_process(pid)
