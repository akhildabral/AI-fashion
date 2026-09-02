import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Razorpay (billing). All optional — billing endpoints return 503 until
  // the keys and plan IDs are configured.
  GOOGLE_CLIENT_ID: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_PLUS: z.string().optional(),
  RAZORPAY_PLAN_PRO: z.string().optional(),
  // Emails that are auto-verified, auto-approved, and given the admin role
  // on register/login — bootstraps the first superuser. Comma-separated.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  // SMTP for verification emails. When unset, verification links are logged
  // to the server console instead of emailed (dev / pre-SMTP fallback).
  SMTP_HOST: z.string().optional(),
  // Web push (morning ritual). All three or none.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('AI Fashion <no-reply@localhost>'),
  // Comma-separated allowed browser origins. Empty = allow all (dev).
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  // ---- AI provider (agnostic) -------------------------------------------
  // Which provider serves chat/vision (tagging, suggestions, stylist plans):
  //   openai     — api.openai.com
  //   openrouter — openrouter.ai (any model it hosts)
  //   anthropic  — api.anthropic.com (Claude)
  //   bedrock    — AWS Bedrock (uses AWS_REGION + standard AWS credentials)
  //   custom     — any OpenAI-compatible endpoint (set AI_BASE_URL)
  AI_PROVIDER: z.enum(['openai', 'openrouter', 'anthropic', 'bedrock', 'custom']).default('openai'),
  // Provider API key. OPENAI_API_KEY is honored as a fallback for
  // backward compatibility. Not used by bedrock (AWS credentials instead).
  AI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Base URL for the custom provider (or to override openai/openrouter).
  AI_BASE_URL: z.string().url().optional(),
  // Chat/vision model id in the provider's naming (e.g. gpt-4o-mini,
  // openai/gpt-4o-mini, claude-haiku-4-5, us.anthropic.claude-...-v1:0).
  // Empty = a sensible default per provider.
  TEXT_MODEL: z.string().optional(),
  AWS_REGION: z.string().optional(),

  // ---- Image generation (look rendering + try-on) -----------------------
  //   auto   — openai when AI_PROVIDER=openai, chat for openrouter/custom,
  //            none for anthropic/bedrock (they host no image generation)
  //   openai — OpenAI /images API (gpt-image-1, dall-e-3)
  //   chat   — an OpenAI-compatible chat endpoint with image output
  //            (e.g. google/gemini-2.5-flash-image via OpenRouter)
  //   none   — disable; looks render without images, try-on errors cleanly
  IMAGE_PROVIDER: z.enum(['auto', 'openai', 'chat', 'none']).default('auto'),
  // Image model id. Empty = gpt-image-1 (openai) / a Gemini image model (chat).
  IMAGE_MODEL: z.string().optional(),
  // Key/endpoint for images when they differ from the text provider's
  // (e.g. Claude for text + an OpenRouter key just for images).
  IMAGE_API_KEY: z.string().min(1).optional(),
  IMAGE_BASE_URL: z.string().url().optional(),
  // Quality tier for gpt-image models (low|medium|high|auto) — drives cost.
  IMAGE_QUALITY: z.enum(['low', 'medium', 'high', 'auto']).default('medium'),
  // How many distinct looks to generate per request. Each look renders one
  // image, so this directly drives image-generation cost.
  LOOKS_PER_REQUEST: z.coerce.number().int().min(1).max(4).default(2),
  // Directory (relative to the backend cwd) where uploaded photos and
  // generated images are stored and served from.
  UPLOADS_DIR: z.string().default('uploads'),
  // When true, wardrobe uploads get a clean background cutout via a local
  // matting model (pixel-preserving, ~free). Falls back to the original photo
  // if matting fails or the model can't be loaded.
  MATTING_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),
  // Cleanup strategy for wardrobe uploads (the original photo is always kept):
  //   auto       — generative when an image provider is configured, else local
  //   generative — white-studio product shot via one image edit per upload
  //   local      — free local matting cutout only
  //   off        — keep the original photo as the display image
  CLEANUP_MODE: z.enum(['auto', 'generative', 'local', 'off']).default('auto'),
  // Which matting model to run: isnet-general-use (default, ~170 MB, high
  // quality) or u2net / u2netp (smaller, weaker on cluttered photos).
  // Downloaded to MATTING_MODEL_DIR on first use.
  MATTING_MODEL: z.enum(['isnet-general-use', 'u2net', 'u2netp']).default('isnet-general-use'),
  // Optional override for where the model file is fetched from.
  MATTING_MODEL_URL: z.string().url().optional(),
  MATTING_MODEL_DIR: z.string().default('models'),
  // Image storage: local disk (default) or S3-compatible object storage.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  // Custom endpoint for R2/MinIO; leave unset for AWS S3.
  S3_ENDPOINT: z.string().url().optional(),
  // Public base URL for stored objects (e.g. a CDN or R2 public bucket URL).
  S3_PUBLIC_URL: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
}).superRefine((cfg, ctx) => {
  if (cfg.STORAGE_DRIVER === 's3' && !cfg.S3_BUCKET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_BUCKET'],
      message: 'S3_BUCKET is required when STORAGE_DRIVER=s3',
    });
  }
  if (cfg.AI_PROVIDER !== 'bedrock' && !cfg.AI_API_KEY && !cfg.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_API_KEY'],
      message: `AI_API_KEY is required for AI_PROVIDER=${cfg.AI_PROVIDER}`,
    });
  }
  if (cfg.AI_PROVIDER === 'bedrock' && !cfg.AWS_REGION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AWS_REGION'],
      message: 'AWS_REGION is required when AI_PROVIDER=bedrock',
    });
  }
  if (cfg.AI_PROVIDER === 'custom' && !cfg.AI_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_BASE_URL'],
      message: 'AI_BASE_URL is required when AI_PROVIDER=custom',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
