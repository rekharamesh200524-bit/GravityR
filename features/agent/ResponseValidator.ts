import type {
  ValidationResult,
  ValidationIssue,
  ValidationIssueType,
  GenerateResponse,
  ToolCall,
} from './types';

export interface ParsedAgentAction {
  action: 'tool_call' | 'complete' | 'clarification' | 'legacy_files' | 'message';
  tool?: string;
  arguments?: Record<string, any>;
  summary?: string;
  reviewNotes?: string;
  question?: string;
  files?: Array<{ path: string; content: string; reason?: string }>;
  content?: string;
}

// ─── ResponseValidator ────────────────────────────────────────
export class ResponseValidator {
  extractCleanJson(rawContent: string): { cleaned: string; parsed: Record<string, any> | null } {
    let content = rawContent.trim();

    if (content.includes('```json')) {
      const start = content.indexOf('```json') + 7;
      const end = content.indexOf('```', start);
      if (end !== -1) {
        content = content.substring(start, end).trim();
      }
    } else if (content.includes('```')) {
      const start = content.indexOf('```') + 3;
      const end = content.indexOf('```', start);
      if (end !== -1) {
        content = content.substring(start, end).trim();
      }
    }

    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null) {
        return { cleaned: content, parsed };
      }
    } catch {
      // Fallback: look for first '{' to last '}'
      const s = content.indexOf('{');
      const e = content.lastIndexOf('}');
      if (s !== -1 && e > s) {
        try {
          const sub = JSON.parse(content.substring(s, e + 1));
          if (typeof sub === 'object' && sub !== null) {
            return { cleaned: content.substring(s, e + 1), parsed: sub };
          }
        } catch {
          // ignore
        }
      }
    }

    return { cleaned: content, parsed: null };
  }

  parseAction(rawContent: string): ParsedAgentAction {
    const { parsed } = this.extractCleanJson(rawContent);

    if (parsed) {
      if (parsed.type === 'tool_call' || (parsed.tool && typeof parsed.tool === 'string')) {
        return {
          action: 'tool_call',
          tool: parsed.tool,
          arguments: parsed.arguments || parsed.parameters || {},
        };
      }

      if (parsed.type === 'complete') {
        return {
          action: 'complete',
          summary: parsed.summary || 'Task completed.',
          reviewNotes: parsed.review_notes || parsed.reviewNotes || '',
        };
      }

      if (parsed.type === 'clarification') {
        return {
          action: 'clarification',
          question: parsed.question || 'User clarification required.',
        };
      }

      if (Array.isArray(parsed.files) && parsed.files.length > 0) {
        return {
          action: 'legacy_files',
          summary: parsed.summary || 'AI proposed changes.',
          files: parsed.files,
          reviewNotes: parsed.review_notes || parsed.review || '',
        };
      }
    }

    return {
      action: 'message',
      content: rawContent,
    };
  }

  validate(response: GenerateResponse | null | undefined): ValidationResult {
    const issues: ValidationIssue[] = [];
    const now = Date.now();

    // ─── Null / empty response
    if (!response || !response.content || response.content.trim().length === 0) {
      issues.push({
        type: 'empty-response',
        severity: 'error',
        message: 'Model returned an empty response.',
      });
      return { isValid: false, issues, validatedAt: now };
    }

    const content = response.content.trim();
    const action = this.parseAction(content);

    // ─── Detect unsupported/destructive operations
    const UNSUPPORTED = ['rm -rf', 'DROP TABLE', 'DROP DATABASE', 'format c:', 'sudo rm', 'git push --force'];
    for (const op of UNSUPPORTED) {
      if (content.toLowerCase().includes(op.toLowerCase())) {
        issues.push({
          type: 'unsupported-operation',
          severity: 'error',
          message: `Detected potentially dangerous operation: "${op}"`,
        });
      }
    }

    // ─── Validate tool call if present
    if (action.action === 'tool_call') {
      if (!action.tool) {
        issues.push({
          type: 'malformed-json',
          severity: 'error',
          message: 'Tool call is missing the "tool" field.',
        });
      }
      if (action.tool === 'write_file') {
        if (!action.arguments?.path) {
          issues.push({
            type: 'missing-file-paths',
            severity: 'error',
            message: 'write_file tool call missing required "path" argument.',
          });
        }
        if (action.arguments?.content === undefined) {
          issues.push({
            type: 'missing-code',
            severity: 'error',
            message: 'write_file tool call missing "content" argument.',
          });
        }
      }
    } else if (action.action === 'legacy_files') {
      // Validate legacy files
      for (const file of action.files || []) {
        if (!file.path) {
          issues.push({
            type: 'missing-file-paths',
            severity: 'error',
            message: 'A file entry is missing a "path" field.',
          });
        }
        if (file.content === undefined) {
          issues.push({
            type: 'missing-code',
            severity: 'error',
            message: `File "${file.path ?? 'unknown'}" is missing content.`,
          });
        }
      }
    }

    // ─── Token limit check
    if (response.finishReason === 'length') {
      issues.push({
        type: 'token-limit-exceeded',
        severity: 'warning',
        message: 'Model stopped due to token limit. Output may be incomplete.',
      });
    }

    const hasErrors = issues.some((i) => i.severity === 'error');
    return { isValid: !hasErrors, issues, validatedAt: now };
  }
}
