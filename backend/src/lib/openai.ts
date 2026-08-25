import OpenAI from 'openai';
import { env } from '../config/env';

// Chat / reasoning model (OpenAI).
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Image generation (Flux via Nebius AI Studio — OpenAI-compatible API).
export const nebius = new OpenAI({
  baseURL: env.NEBIUS_BASE_URL,
  apiKey: env.NEBIUS_API_KEY,
});
