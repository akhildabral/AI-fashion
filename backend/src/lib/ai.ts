import type { LanguageModel } from 'ai';
import { env } from '../config/env';

// Provider-agnostic chat/vision model for tagging, outfit suggestions, and
// stylist planning. All call sites go through generateObject (Vercel AI SDK),
// so swapping providers is pure configuration:
//   AI_PROVIDER=openai|openrouter|anthropic|bedrock|custom
//   AI_API_KEY=...        TEXT_MODEL=<provider's model id>

export const aiApiKey = env.AI_API_KEY ?? env.OPENAI_API_KEY ?? '';

const DEFAULT_TEXT_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  bedrock: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  custom: 'gpt-4o-mini',
};

export const textModelId = env.TEXT_MODEL || DEFAULT_TEXT_MODEL[env.AI_PROVIDER];

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

let cached: Promise<LanguageModel> | null = null;

async function createTextModel(): Promise<LanguageModel> {
  return createTextModelFor(textModelId);
}

async function createTextModelFor(modelId: string): Promise<LanguageModel> {
  switch (env.AI_PROVIDER) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      return createAnthropic({
        apiKey: aiApiKey,
        ...(env.AI_BASE_URL ? { baseURL: env.AI_BASE_URL } : {}),
      })(modelId);
    }
    case 'bedrock': {
      const { createAmazonBedrock } = await import('@ai-sdk/amazon-bedrock');
      // Credentials come from the standard AWS environment/credential chain.
      return createAmazonBedrock({ region: env.AWS_REGION })(modelId);
    }
    case 'openrouter':
    case 'custom':
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const baseURL =
        env.AI_BASE_URL ?? (env.AI_PROVIDER === 'openrouter' ? OPENROUTER_BASE_URL : undefined);
      const provider = createOpenAI({
        apiKey: aiApiKey,
        ...(baseURL ? { baseURL } : {}),
      });
      // .chat() pins the Chat Completions API — gateways don't serve /responses.
      return provider.chat(modelId);
    }
  }
}

export function textModel(): Promise<LanguageModel> {
  if (!cached) cached = createTextModel();
  return cached;
}

// Finding WHERE garments are in a photo needs a model that can localise;
// small chat models guess boxes in round numbers. Gemini Flash does it well
// and cheaply, so it is the default on OpenRouter; elsewhere, the text model.
export const visionModelId =
  env.VISION_MODEL || (env.AI_PROVIDER === 'openrouter' ? 'google/gemini-2.5-flash' : textModelId);
let cachedVision: Promise<LanguageModel> | null = null;
export function visionModel(): Promise<LanguageModel> {
  if (visionModelId === textModelId) return textModel();
  if (!cachedVision) cachedVision = createTextModelFor(visionModelId);
  return cachedVision;
}
