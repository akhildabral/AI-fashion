import OpenAI from 'openai';
import { env } from '../config/env';

// Single OpenAI client — used for both chat/reasoning and image generation.
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
