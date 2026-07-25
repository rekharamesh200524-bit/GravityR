import re

BLOCKED_PATTERNS = [
    r"\bshutdown\b",
    r"\bformat\b",
    r"\bdel\s+/s\b",
    r"\brm\s+-rf\b",
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
