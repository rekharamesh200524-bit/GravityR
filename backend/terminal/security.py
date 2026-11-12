import re

BLOCKED_PATTERNS = [
    r"\bshutdown\s+/[sr]\b",
    r"\bformat\s+[a-z]:",
    r"\bdel\s+/s\s+/q\s+[a-z]:\\",
    r"\brm\s+-rf\s+/\s*$",
    r"\bdiskpart\b"
]

def is_command_safe(command: str) -> bool:
    """
    Checks if a terminal command is safe based on the defined blocklist rules.
    """
    cmd_stripped = command.strip().lower()
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, cmd_stripped):
            return False
    return True
