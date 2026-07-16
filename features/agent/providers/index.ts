import type { IModelProvider, ProviderName } from '../types';
import {
  GoogleProvider,
  OllamaProvider,
  OpenAIProvider,
  ClaudeProvider,
  RunPodProvider,
} from './providers';

export {
  GoogleProvider,
  OllamaProvider,
  OpenAIProvider,
  ClaudeProvider,
  RunPodProvider,
} from './providers';

// ─── Provider Registry ───────────────────────────────────────
const registry: Record<ProviderName, IModelProvider> = {
  google: new GoogleProvider(),
  ollama: new OllamaProvider(),
  openai: new OpenAIProvider(),
  claude: new ClaudeProvider(),
  runpod: new RunPodProvider(),
};

export function getProvider(name: ProviderName): IModelProvider {
  const provider = registry[name];
  if (!provider) {
    throw new Error(`Unknown model provider: "${name}". Available: ${Object.keys(registry).join(', ')}`);
  }
  return provider;
}

export function listProviders(): ProviderName[] {
  return Object.keys(registry) as ProviderName[];
}

export function getDefaultProvider(): IModelProvider {
  return registry['google'];
}
