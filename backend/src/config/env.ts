import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OPENAI_API_KEY: z.string().min(1),
  // OpenAI image model used to render outfits. gpt-image-1 returns base64
  // (served as a data URL); dall-e-3 (if your key has it) returns a hosted URL.
  IMAGE_MODEL: z.string().default('gpt-image-1'),
  // Quality tier for gpt-image models (low|medium|high|auto) — drives cost.
  IMAGE_QUALITY: z.enum(['low', 'medium', 'high', 'auto']).default('medium'),
  // How many distinct looks to generate per request. Each look renders one
  // image, so this directly drives image-generation cost.
  LOOKS_PER_REQUEST: z.coerce.number().int().min(1).max(4).default(2),
  // Directory (relative to the backend cwd) where uploaded photos and
  // generated images are stored and served from.
  UPLOADS_DIR: z.string().default('uploads'),
  // When true, wardrobe uploads are re-rendered onto a clean studio background
  // (one gpt-image edit per upload — adds a little cost/latency). Set to "false"
  // to keep the original photo as-is.
  WARDROBE_CLEAN_BG: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
