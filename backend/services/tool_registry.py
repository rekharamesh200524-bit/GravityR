from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    category: str  # "repository" | "file_modification" | "terminal" | "git"
    description: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    mutating: bool = False
    requires_approval: bool = False
    aliases: List[str] = field(default_factory=list)


TOOL_REGISTRY: Dict[str, ToolDefinition] = {}


def _register(defn: ToolDefinition) -> None:
    TOOL_REGISTRY[defn.name] = defn


# ─── Repository Tools (Read-Only) ─────────────────────────────────────────────
_register(ToolDefinition(
    name="list_files",
    category="repository",
    description="List files and folders inside the active workspace (optionally filtered by directory or extension).",
    input_schema={
        "type": "object",
        "properties": {
            "directory": {"type": "string", "description": "Relative directory path (default '.')"},
            "extension": {"type": "string", "description": "Optional extension filter e.g. '.tsx'"},
            "max_results": {"type": "integer", "description": "Max entries to return (default 200)"},
        },
        "required": [],
    },
    output_schema={"type": "object", "properties": {"files": {"type": "array"}, "count": {"type": "integer"}}},
    mutating=False,
))

_register(ToolDefinition(
    name="read_file",
    category="repository",
    description="Read the full text content of a file inside the workspace.",
    input_schema={
        "type": "object",
        "properties": {"path": {"type": "string", "description": "Relative file path inside workspace"}},
        "required": ["path"],
    },
    output_schema={"type": "object", "properties": {"content": {"type": "string"}, "path": {"type": "string"}}},
    mutating=False,
))

_register(ToolDefinition(
    name="search_code",
    category="repository",
    description="Search for a keyword or regex pattern across workspace source files and return matching lines.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search text or pattern"},
            "max_matches": {"type": "integer", "description": "Maximum matches to return (default 50)"},
        },
        "required": ["query"],
    },
    output_schema={"type": "object", "properties": {"results": {"type": "array"}, "count": {"type": "integer"}}},
    mutating=False,
    aliases=["search_files"],
))

_register(ToolDefinition(
    name="find_references",
    category="repository",
    description="Find all references/usages of a symbol, component, or identifier across workspace files.",
    input_schema={
        "type": "object",
        "properties": {"symbol": {"type": "string", "description": "Identifier or symbol name to locate"}},
        "required": ["symbol"],
    },
    output_schema={"type": "object", "properties": {"references": {"type": "array"}, "count": {"type": "integer"}}},
    mutating=False,
))

_register(ToolDefinition(
    name="get_project_structure",
    category="repository",
    description="Return the workspace directory tree, detected framework/language, and key config files.",
    input_schema={
        "type": "object",
        "properties": {"max_depth": {"type": "integer", "description": "Max folder depth (default 4)"}},
        "required": [],
    },
    output_schema={"type": "object", "properties": {"tree": {"type": "array"}, "summary": {"type": "object"}}},
    mutating=False,
))

_register(ToolDefinition(
    name="inspect_file",
    category="repository",
    description="Inspect a file's metadata, line count, exports/imports/symbols, and preview.",
    input_schema={
        "type": "object",
        "properties": {"path": {"type": "string", "description": "Relative file path inside workspace"}},
        "required": ["path"],
    },
    output_schema={"type": "object", "properties": {"path": {"type": "string"}, "lines": {"type": "integer"}, "symbols": {"type": "array"}}},
    mutating=False,
))

# ─── File Modification Tools (Agent Mode) ─────────────────────────────────────
_register(ToolDefinition(
    name="create_file",
    category="file_modification",
    description="Create a new file with the given content (fails if file already exists unless overwrite=true).",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "content": {"type": "string"},
            "overwrite": {"type": "boolean"},
        },
        "required": ["path", "content"],
    },
    output_schema={"type": "object", "properties": {"path": {"type": "string"}, "status": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="write_file",
    category="file_modification",
    description="Create or overwrite a workspace file with full content (automatically creates a backup first).",
    input_schema={
        "type": "object",
        "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
        "required": ["path", "content"],
    },
    output_schema={"type": "object", "properties": {"path": {"type": "string"}, "backup": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="replace_in_file",
    category="file_modification",
    description="Replace an exact target snippet inside an existing file with replacement text.",
    input_schema={
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "target": {"type": "string", "description": "Exact existing text to replace"},
            "replacement": {"type": "string", "description": "New replacement text"},
            "replace_all": {"type": "boolean", "description": "Replace all occurrences (default false)"},
        },
        "required": ["path", "target", "replacement"],
    },
    output_schema={"type": "object", "properties": {"path": {"type": "string"}, "replacements": {"type": "integer"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="delete_file",
    category="file_modification",
    description="Delete a file inside the workspace (creates a backup before deletion).",
    input_schema={
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    },
    output_schema={"type": "object", "properties": {"path": {"type": "string"}, "backup": {"type": "string"}}},
    mutating=True,
    requires_approval=True,
))

_register(ToolDefinition(
    name="rename_file",
    category="file_modification",
    description="Rename a file inside the workspace.",
    input_schema={
        "type": "object",
        "properties": {"old_path": {"type": "string"}, "new_path": {"type": "string"}},
        "required": ["old_path", "new_path"],
    },
    output_schema={"type": "object", "properties": {"old_path": {"type": "string"}, "new_path": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="move_file",
    category="file_modification",
    description="Move a file to another path inside the workspace.",
    input_schema={
        "type": "object",
        "properties": {"old_path": {"type": "string"}, "new_path": {"type": "string"}},
        "required": ["old_path", "new_path"],
    },
    output_schema={"type": "object", "properties": {"old_path": {"type": "string"}, "new_path": {"type": "string"}}},
    mutating=True,
))

# ─── Terminal & Validation Tools (Agent Mode) ─────────────────────────────────
_register(ToolDefinition(
    name="run_terminal_command",
    category="terminal",
    description="Execute an approved build, test, lint, package, or git command inside the workspace root.",
    input_schema={
        "type": "object",
        "properties": {"command": {"type": "string"}},
        "required": ["command"],
    },
    output_schema={"type": "object", "properties": {"exit_code": {"type": "integer"}, "stdout": {"type": "string"}, "stderr": {"type": "string"}}},
    mutating=True,
    aliases=["run_terminal"],
))

_register(ToolDefinition(
    name="run_tests",
    category="terminal",
    description="Run the project's test suite (auto-detected or specified command).",
    input_schema={
        "type": "object",
        "properties": {"command": {"type": "string", "description": "Optional explicit test command"}},
        "required": [],
    },
    output_schema={"type": "object", "properties": {"exit_code": {"type": "integer"}, "stdout": {"type": "string"}, "stderr": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="run_linter",
    category="terminal",
    description="Run the project's linter / typecheck (e.g. eslint, tsc --noEmit, flake8).",
    input_schema={
        "type": "object",
        "properties": {"command": {"type": "string", "description": "Optional explicit lint command"}},
        "required": [],
    },
    output_schema={"type": "object", "properties": {"exit_code": {"type": "integer"}, "stdout": {"type": "string"}, "stderr": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="run_build",
    category="terminal",
    description="Run the project's build / compilation check.",
    input_schema={
        "type": "object",
        "properties": {"command": {"type": "string", "description": "Optional explicit build command"}},
        "required": [],
    },
    output_schema={"type": "object", "properties": {"exit_code": {"type": "integer"}, "stdout": {"type": "string"}, "stderr": {"type": "string"}}},
    mutating=True,
))

# ─── Git Tools ────────────────────────────────────────────────────────────────
_register(ToolDefinition(
    name="git_status",
    category="git",
    description="Inspect git working tree status.",
    input_schema={"type": "object", "properties": {}, "required": []},
    output_schema={"type": "object", "properties": {"stdout": {"type": "string"}}},
    mutating=False,
))

_register(ToolDefinition(
    name="git_diff",
    category="git",
    description="Inspect git unified diff of uncommitted changes.",
    input_schema={"type": "object", "properties": {}, "required": []},
    output_schema={"type": "object", "properties": {"stdout": {"type": "string"}}},
    mutating=False,
))

_register(ToolDefinition(
    name="git_stage",
    category="git",
    description="Stage file(s) in git index.",
    input_schema={"type": "object", "properties": {"paths": {"type": "array", "items": {"type": "string"}}}, "required": []},
    output_schema={"type": "object", "properties": {"stdout": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="git_unstage",
    category="git",
    description="Unstage file(s) from git index.",
    input_schema={"type": "object", "properties": {"paths": {"type": "array", "items": {"type": "string"}}}, "required": []},
    output_schema={"type": "object", "properties": {"stdout": {"type": "string"}}},
    mutating=True,
))

_register(ToolDefinition(
    name="git_commit",
    category="git",
    description="Commit staged changes with a commit message.",
    input_schema={"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]},
    output_schema={"type": "object", "properties": {"stdout": {"type": "string"}}},
    mutating=True,
    requires_approval=True,
))


def resolve_tool(name: str) -> Optional[ToolDefinition]:
    if name in TOOL_REGISTRY:
        return TOOL_REGISTRY[name]
    for defn in TOOL_REGISTRY.values():
        if name in defn.aliases:
            return defn
    return None


def get_tools_prompt_spec(mode: str = "agent") -> str:
    """Format allowed tools and schemas for the LLM system prompt."""
    lines: List[str] = []
    for defn in TOOL_REGISTRY.values():
        if mode == "ask" and defn.mutating:
            continue
        req = defn.input_schema.get("required", [])
        props = list(defn.input_schema.get("properties", {}).keys())
        lines.append(f"- `{defn.name}` (args: {props}, required: {req}): {defn.description}")
    return "\n".join(lines)

