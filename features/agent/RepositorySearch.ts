import type { FileNode } from '../../types';
import type { SearchQuery, SearchResult, RepositorySearchOutput, SearchType } from './types';

// ─── RepositorySearch ────────────────────────────────────────
export class RepositorySearch {
  private fileTree: FileNode[] = [];

  /** Provide the current workspace file tree before searching */
  setFileTree(tree: FileNode[]): void {
    this.fileTree = tree;
  }

  /** Flatten the tree into a list of all file paths */
  private flatten(nodes: FileNode[], results: FileNode[] = []): FileNode[] {
    for (const node of nodes) {
      results.push(node);
      if (node.children) this.flatten(node.children, results);
    }
    return results;
  }

  async search(query: SearchQuery): Promise<RepositorySearchOutput> {
    const start = Date.now();
    const allFiles = this.flatten(this.fileTree).filter((n) => !n.isFolder);
    const searchResults: SearchResult[] = [];

    const term = query.term.toLowerCase();

    for (const file of allFiles) {
      const fileName = file.name.toLowerCase();
      const filePath = file.path.toLowerCase();
      const content = (file.content || '').toLowerCase();

      // ─── Filename match
      if (query.types.includes('filename') && fileName.includes(term)) {
        searchResults.push({
          filePath: file.path,
          fileName: file.name,
          matchType: 'filename',
          confidence: fileName === term ? 1.0 : 0.8,
          reason: `Filename contains "${query.term}"`,
        });
        continue;
      }

      // ─── Extension match
      if (query.types.includes('extension') && filePath.endsWith(term)) {
        searchResults.push({
          filePath: file.path,
          fileName: file.name,
          matchType: 'extension',
          confidence: 0.5,
          reason: `File extension matches "${query.term}"`,
        });
        continue;
      }

      // ─── Keyword match in content
      if (query.types.includes('keyword') && content.includes(term)) {
        const lineIdx = content.split('\n').findIndex((l) => l.includes(term));
        const snippet = content.split('\n')[lineIdx]?.trim().slice(0, 120);
        searchResults.push({
          filePath: file.path,
          fileName: file.name,
          matchType: 'keyword',
          confidence: 0.65,
          reason: `Content contains keyword "${query.term}"`,
          snippet,
          lineNumber: lineIdx + 1,
        });
        continue;
      }

      // ─── Symbol match (class/function names in code)
      if (query.types.includes('symbol') && content.includes(term)) {
        const symbolPattern = new RegExp(
          `(function|class|const|let|var|def|export)\\s+${term}`,
          'i',
        );
        if (symbolPattern.test(file.content || '')) {
          searchResults.push({
            filePath: file.path,
            fileName: file.name,
            matchType: 'symbol',
            confidence: 0.9,
            reason: `Symbol definition found for "${query.term}"`,
          });
        }
      }
    }

    // Sort by confidence descending
    searchResults.sort((a, b) => b.confidence - a.confidence);

    return {
      query,
      results: searchResults.slice(0, 20), // cap at 20 results
      totalScanned: allFiles.length,
      durationMs: Date.now() - start,
    };
  }

  /** Convenience: search by prompt keywords across all types */
  async searchForPrompt(prompt: string): Promise<RepositorySearchOutput> {
    // Extract meaningful terms from the prompt
    const stopWords = new Set([
      'the', 'a', 'an', 'in', 'on', 'to', 'of', 'and', 'or', 'is',
      'it', 'for', 'with', 'my', 'me', 'i', 'create', 'update', 'fix',
      'add', 'make', 'build', 'generate', 'please', 'can', 'you',
    ]);

    const terms = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stopWords.has(t));

    if (terms.length === 0) {
      return { query: { term: '', types: [] }, results: [], totalScanned: 0, durationMs: 0 };
    }

    // Search for the most meaningful term
    const primaryTerm = terms[0];
    const allTypes: SearchType[] = ['filename', 'keyword', 'symbol'];

    return this.search({ term: primaryTerm, types: allTypes });
  }
}
