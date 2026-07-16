import type {
  ValidationResult,
  ValidationIssue,
  ValidationIssueType,
  GenerateResponse,
} from './types';

// ─── ResponseValidator ────────────────────────────────────────
export class ResponseValidator {
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

    // ─── Try to parse JSON (expected output format)
    let parsed: Record<string, unknown> | null = null;
    if (content.startsWith('{')) {
      try {
        parsed = JSON.parse(content);
      } catch {
        issues.push({
          type: 'malformed-json',
          severity: 'error',
          message: 'Model output starts with "{" but is not valid JSON.',
        });
      }
    }

    // ─── Check for required JSON fields if JSON was returned
    if (parsed !== null) {
      if (!parsed['summary']) {
        issues.push({
          type: 'missing-code',
          severity: 'warning',
          message: 'Response JSON is missing the "summary" field.',
        });
      }

      if (!Array.isArray(parsed['files']) || (parsed['files'] as unknown[]).length === 0) {
        issues.push({
          type: 'missing-file-paths',
          severity: 'warning',
          message: 'Response contains no file changes.',
        });
      } else {
        // Validate each file entry
        for (const file of parsed['files'] as Record<string, unknown>[]) {
          if (!file['path']) {
            issues.push({
              type: 'missing-file-paths',
              severity: 'error',
              message: 'A file entry in the response is missing a "path" field.',
            });
          }
          if (!file['content']) {
            issues.push({
              type: 'missing-code',
              severity: 'error',
              message: `File "${file['path'] ?? 'unknown'}" is missing content.`,
            });
          }
        }
      }
    }

    // ─── Detect unsupported operations
    const UNSUPPORTED = ['rm -rf', 'DROP TABLE', 'format c:', 'sudo rm'];
    for (const op of UNSUPPORTED) {
      if (content.toLowerCase().includes(op.toLowerCase())) {
        issues.push({
          type: 'unsupported-operation',
          severity: 'error',
          message: `Detected potentially dangerous operation: "${op}"`,
        });
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
