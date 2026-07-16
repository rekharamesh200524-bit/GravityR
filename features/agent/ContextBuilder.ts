import type { FileNode } from '../../types';
import type {
  ContextBuildOutput,
  ContextFile,
  RepositorySearchOutput,
  PlannerOutput,
} from './types';

const MAX_CONTEXT_TOKENS = 32_000;
const AVERAGE_CHARS_PER_TOKEN = 4;

function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', sql: 'sql', sh: 'bash', env: 'dotenv',
  };
  return map[ext] ?? 'plaintext';
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / AVERAGE_CHARS_PER_TOKEN);
}

// ─── ContextBuilder ──────────────────────────────────────────
export class ContextBuilder {
  private fileTree: FileNode[] = [];

  setFileTree(tree: FileNode[]): void {
    this.fileTree = tree;
  }

  private flatten(nodes: FileNode[]): FileNode[] {
    const results: FileNode[] = [];
    const walk = (n: FileNode[]) => {
      for (const node of n) {
        if (!node.isFolder) results.push(node);
        if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    return results;
  }

  private findFile(path: string): FileNode | undefined {
    return this.flatten(this.fileTree).find((f) => f.path === path);
  }

  async build(
    taskId: string,
    searchOutput: RepositorySearchOutput,
    plannerOutput: PlannerOutput,
  ): Promise<ContextBuildOutput> {
    const start = Date.now();
    const contextFiles: ContextFile[] = [];
    let totalTokens = 0;
    let truncated = false;

    // Collect file paths from two sources: search results + planner guesses
    const candidatePaths = new Set<string>([
      ...searchOutput.results.map((r) => r.filePath),
      ...plannerOutput.affectedFiles.filter((p) => !p.startsWith('(')),
    ]);

    for (const filePath of candidatePaths) {
      const node = this.findFile(filePath);
      const searchResult = searchOutput.results.find((r) => r.filePath === filePath);
      const content = node?.content ?? '// [File content not yet loaded]';
      const sizeBytes = content.length;
      const tokenCount = estimateTokens(content);

      if (totalTokens + tokenCount > MAX_CONTEXT_TOKENS) {
        truncated = true;
        continue;
      }

      totalTokens += tokenCount;
      contextFiles.push({
        filePath,
        fileName: filePath.split('/').pop() ?? filePath,
        language: detectLanguage(filePath),
        content,
        sizeBytes,
        confidence: searchResult?.confidence ?? 0.5,
        reason: searchResult?.reason ?? 'Identified by Planner as likely affected',
        included: true,
      });
    }

    // Sort by confidence
    contextFiles.sort((a, b) => b.confidence - a.confidence);

    return {
      taskId,
      files: contextFiles,
      totalTokenEstimate: totalTokens,
      truncated,
      generatedAt: start,
    };
  }
}
