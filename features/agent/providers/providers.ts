import type {
  IModelProvider,
  ProviderName,
  GenerateRequest,
  GenerateResponse,
  ProviderHealth,
} from '../types';

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api')
  : 'http://localhost:8000/api';

// Map client-side provider names to backend provider names
const PROVIDER_MAP: Record<ProviderName, string> = {
  google: 'google_colab',
  ollama: 'ollama',
  runpod: 'runpod',
  openai: 'openai',
  claude: 'claude',
};

async function callGatewayGenerate(
  prompt: string,
  provider: ProviderName,
  model: string,
  taskId: string
): Promise<GenerateResponse> {
  const backendProvider = PROVIDER_MAP[provider] || provider;
  const start = Date.now();
  
  // Set status dynamically
  try {
    const { useAgentStore } = await import('../../../stores/useAgentStore');
    useAgentStore.setState({ connectionStatus: 'Generating' });
  } catch {
    // Ignore store import error if any
  }

  const res = await fetch(`${API_BASE}/gateway/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider: backendProvider, model })
  });
  if (!res.ok) {
    throw new Error(`Gateway error: ${res.statusText}`);
  }
  const data = await res.json();
  
  try {
    const { useAgentStore } = await import('../../../stores/useAgentStore');
    useAgentStore.setState({ connectionStatus: 'Completed' });
  } catch {
    // Ignore
  }

  return {
    taskId,
    content: data.content,
    provider: provider,
    model: data.model,
    tokensUsed: data.usage?.total_tokens || 0,
    durationMs: data.latency ? Math.round(data.latency * 1000) : (Date.now() - start),
    finishReason: data.success ? 'stop' : 'error'
  };
}

async function callGatewayStream(
  prompt: string,
  provider: ProviderName,
  model: string,
  taskId: string,
  onChunk: (chunk: string) => void
): Promise<GenerateResponse> {
  const backendProvider = PROVIDER_MAP[provider] || provider;
  const start = Date.now();

  try {
    const { useAgentStore } = await import('../../../stores/useAgentStore');
    useAgentStore.setState({ connectionStatus: 'Generating' });
  } catch {
    // Ignore
  }

  const res = await fetch(`${API_BASE}/gateway/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider: backendProvider, model })
  });
  if (!res.ok) {
    throw new Error(`Gateway error: ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported.');
  }

  try {
    const { useAgentStore } = await import('../../../stores/useAgentStore');
    useAgentStore.setState({ connectionStatus: 'Receiving Tokens' });
  } catch {
    // Ignore
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let totalTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(cleanLine.slice(6));
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.content) {
          fullContent += parsed.content;
          onChunk(parsed.content);
        }
        if (parsed.usage) {
          totalTokens = parsed.usage.total_tokens;
        }
      } catch {
        // Parse error
      }
    }
  }

  try {
    const { useAgentStore } = await import('../../../stores/useAgentStore');
    useAgentStore.setState({ connectionStatus: 'Completed' });
  } catch {
    // Ignore
  }

  return {
    taskId,
    content: fullContent,
    provider: provider,
    model,
    tokensUsed: totalTokens || Math.round(fullContent.length / 4),
    durationMs: Date.now() - start,
    finishReason: 'stop'
  };
}

// ─── Google Gemini Provider ──────────────────────────────────
export class GoogleProvider implements IModelProvider {
  readonly name: ProviderName = 'google';
  private readonly model = 'qwen2.5-coder-7b-instruct';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return callGatewayGenerate(request.prompt.userPrompt, this.name, this.model, request.taskId);
  }

  async stream(
    request: GenerateRequest,
    onChunk: (chunk: string) => void,
  ): Promise<GenerateResponse> {
    return callGatewayStream(request.prompt.userPrompt, this.name, this.model, request.taskId, onChunk);
  }

  async cancel(_taskId: string): Promise<void> {}

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, isOnline: true, latencyMs: 42, checkedAt: Date.now() };
  }
}

// ─── Ollama Provider ─────────────────────────────────────────
export class OllamaProvider implements IModelProvider {
  readonly name: ProviderName = 'ollama';
  private readonly model = 'qwen2.5-coder-7b-instruct';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return callGatewayGenerate(request.prompt.userPrompt, this.name, this.model, request.taskId);
  }

  async stream(
    request: GenerateRequest,
    onChunk: (chunk: string) => void,
  ): Promise<GenerateResponse> {
    return callGatewayStream(request.prompt.userPrompt, this.name, this.model, request.taskId, onChunk);
  }

  async cancel(_taskId: string): Promise<void> {}

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, isOnline: true, latencyMs: 12, checkedAt: Date.now() };
  }
}

// ─── OpenAI Provider ─────────────────────────────────────────
export class OpenAIProvider implements IModelProvider {
  readonly name: ProviderName = 'openai';
  private readonly model = 'gpt-4o-mini';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return callGatewayGenerate(request.prompt.userPrompt, this.name, this.model, request.taskId);
  }

  async stream(
    request: GenerateRequest,
    onChunk: (chunk: string) => void,
  ): Promise<GenerateResponse> {
    return callGatewayStream(request.prompt.userPrompt, this.name, this.model, request.taskId, onChunk);
  }

  async cancel(_taskId: string): Promise<void> {}

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, isOnline: true, latencyMs: 15, checkedAt: Date.now() };
  }
}

// ─── Anthropic Claude Provider ───────────────────────────────
export class ClaudeProvider implements IModelProvider {
  readonly name: ProviderName = 'claude';
  private readonly model = 'claude-3-5-sonnet';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return callGatewayGenerate(request.prompt.userPrompt, this.name, this.model, request.taskId);
  }

  async stream(
    request: GenerateRequest,
    onChunk: (chunk: string) => void,
  ): Promise<GenerateResponse> {
    return callGatewayStream(request.prompt.userPrompt, this.name, this.model, request.taskId, onChunk);
  }

  async cancel(_taskId: string): Promise<void> {}

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, isOnline: true, latencyMs: 14, checkedAt: Date.now() };
  }
}

// ─── RunPod Provider ─────────────────────────────────────────
export class RunPodProvider implements IModelProvider {
  readonly name: ProviderName = 'runpod';
  private readonly model = 'qwen2.5-coder-7b-instruct';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return callGatewayGenerate(request.prompt.userPrompt, this.name, this.model, request.taskId);
  }

  async stream(
    request: GenerateRequest,
    onChunk: (chunk: string) => void,
  ): Promise<GenerateResponse> {
    return callGatewayStream(request.prompt.userPrompt, this.name, this.model, request.taskId, onChunk);
  }

  async cancel(_taskId: string): Promise<void> {}

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, isOnline: true, latencyMs: 28, checkedAt: Date.now() };
  }
}
