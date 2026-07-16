import type {
  ReviewData,
  ReviewWarning,
  FileDiffSummary,
  ComplexityLevel,
  GenerateResponse,
  PlannerOutput,
  ValidationResult,
} from './types';

// ─── ReviewEngine ─────────────────────────────────────────────
export class ReviewEngine {
  async review(
    response: GenerateResponse,
    plannerOutput: PlannerOutput,
    validationResult: ValidationResult,
  ): Promise<ReviewData> {
    const apiBase = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api')
      : 'http://localhost:8000/api';

    try {
      const res = await fetch(`${apiBase}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: plannerOutput.taskId,
          prompt: plannerOutput.summary,
          ai_response: response.content
        })
      });

      if (res.ok) {
        const reviewData = await res.json();
        const warnings: ReviewWarning[] = [...(reviewData.warnings || [])];
        
        for (const issue of validationResult.issues) {
          warnings.push({
            id: `validation-${issue.type}`,
            severity: issue.severity === 'error' ? 'error' : 'warning',
            message: issue.message,
          });
        }

        return {
          taskId: reviewData.taskId,
          summary: reviewData.summary || `Processed task changes.`,
          filesChanged: reviewData.filesChanged || [],
          warnings,
          complexity: reviewData.complexity || 'moderate',
          reviewNotes: reviewData.reviewNotes || '',
          requiresHumanApproval: reviewData.requiresHumanApproval || warnings.some((w) => w.severity === 'error'),
          reviewedAt: Date.now(),
        };
      }
    } catch (e) {
      console.warn("Backend review endpoint failed, using local review parser fallback:", e);
    }

    const warnings: ReviewWarning[] = [];

    // ─── Lift validation issues into review warnings
    for (const issue of validationResult.issues) {
      warnings.push({
        id: `validation-${issue.type}`,
        severity: issue.severity === 'error' ? 'error' : 'warning',
        message: issue.message,
      });
    }

    // ─── Lift planner warnings
    for (const w of plannerOutput.warnings) {
      warnings.push({
        id: `planner-${plannerOutput.taskId}-${warnings.length}`,
        severity: plannerOutput.riskLevel === 'critical' ? 'error' : 'warning',
        message: w,
      });
    }

    // ─── Parse file diffs from mock response
    const filesChanged: FileDiffSummary[] = this.extractFileDiffs(response, plannerOutput);

    // ─── Determine reviewed complexity
    const complexity: ComplexityLevel = filesChanged.length > 5
      ? 'complex'
      : plannerOutput.estimatedComplexity;

    // ─── Build review notes
    const reviewNotes = this.buildReviewNotes(response, plannerOutput, filesChanged, warnings);

    return {
      taskId: plannerOutput.taskId,
      summary: `Task "${plannerOutput.summary}" completed via ${response.provider} (${response.model}). ` +
        `${filesChanged.length} file(s) affected. ` +
        `${warnings.length} warning(s) generated.`,
      filesChanged,
      warnings,
      complexity,
      reviewNotes,
      requiresHumanApproval: warnings.some((w) => w.severity === 'error') || plannerOutput.riskLevel === 'critical',
      reviewedAt: Date.now(),
    };
  }

  private extractFileDiffs(
    response: GenerateResponse,
    plannerOutput: PlannerOutput,
  ): FileDiffSummary[] {
    // For mock responses, generate synthetic diff summaries from planner's affected files
    const files = plannerOutput.affectedFiles.filter((p) => !p.startsWith('('));
    if (files.length === 0) {
      return [{
        filePath: 'output/generated.ts',
        linesAdded: Math.floor(Math.random() * 80) + 10,
        linesRemoved: Math.floor(Math.random() * 20),
        changeType: 'modified',
      }];
    }
    return files.map((filePath) => ({
      filePath,
      linesAdded: Math.floor(Math.random() * 50) + 5,
      linesRemoved: Math.floor(Math.random() * 15),
      changeType: 'modified' as const,
    }));
  }

  private buildReviewNotes(
    response: GenerateResponse,
    plannerOutput: PlannerOutput,
    files: FileDiffSummary[],
    warnings: ReviewWarning[],
  ): string {
    const lines: string[] = [
      `## Review Summary`,
      `- Provider: **${response.provider}** (${response.model})`,
      `- Tokens used: ${response.tokensUsed.toLocaleString()}`,
      `- Duration: ${response.durationMs}ms`,
      `- Files changed: ${files.length}`,
      `- Risk level: **${plannerOutput.riskLevel.toUpperCase()}**`,
      `- Complexity: ${plannerOutput.estimatedComplexity}`,
      '',
      `## Changed Files`,
      ...files.map((f) => `- \`${f.filePath}\` (+${f.linesAdded} / -${f.linesRemoved})`),
    ];

    if (warnings.length > 0) {
      lines.push('', `## Warnings (${warnings.length})`);
      for (const w of warnings) {
        const icon = w.severity === 'error' ? '🔴' : w.severity === 'warning' ? '🟡' : '🔵';
        lines.push(`${icon} ${w.message}`);
      }
    }

    return lines.join('\n');
  }
}
