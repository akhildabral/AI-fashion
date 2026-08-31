import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { env } from '../config/env';
import { aiApiKey, OPENROUTER_BASE_URL } from './ai';

// Provider-agnostic image generation and editing (look rendering, try-on).
//
//   openai — the OpenAI /images API (gpt-image-1, dall-e-3)
//   chat   — any OpenAI-compatible chat endpoint whose model can return
//            images (e.g. google/gemini-2.5-flash-image via OpenRouter);
//            editing sends the source photos as image inputs
//   none   — disabled: generateImage resolves null (looks render without
//            an image) and editImage returns null (try-on 502s cleanly)
//
// IMAGE_API_KEY / IMAGE_BASE_URL override the text provider's credentials so
// e.g. Claude can do the styling while an OpenRouter key renders the images.

export type ResolvedImageProvider = 'openai' | 'chat' | 'none';

export function resolveImageProvider(): ResolvedImageProvider {
  if (env.IMAGE_PROVIDER !== 'auto') return env.IMAGE_PROVIDER;
  switch (env.AI_PROVIDER) {
    case 'openai':
      return 'openai';
    case 'openrouter':
    case 'custom':
      return 'chat';
    default:
      // Anthropic/Bedrock host no image generation; pair them with
      // IMAGE_PROVIDER=openai or =chat (+ IMAGE_API_KEY) to enable images.
      return 'none';
  }
}

function imageApiKey(): string {
  return env.IMAGE_API_KEY ?? aiApiKey;
}

function imageModelId(provider: ResolvedImageProvider): string {
  if (env.IMAGE_MODEL) return env.IMAGE_MODEL;
  return provider === 'openai' ? 'gpt-image-1' : 'google/gemini-2.5-flash-image';
}

export interface SourceImage {
  data: Buffer;
  mime: string;
  // Optional caption injected immediately before the image in chat-based
  // requests (e.g. "PERSON — the person to dress:"). Multi-image edits adhere
  // far better when every image is introduced by name.
  label?: string;
}

// Source photos can be multi-MB camera originals or large stored PNGs, and
// base64 encoding inflates them ~33% — enough to blow provider request
// limits. Models don't need more than ~1.5k px as an edit reference, so
// normalize every source to a bounded JPEG (transparency flattened to white).
async function normalizeSource(s: SourceImage): Promise<SourceImage> {
  try {
    const data = await sharp(s.data)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { data, mime: 'image/jpeg' };
  } catch {
    return s;
  }
}

// ---- openai /images -------------------------------------------------------

function openaiClient(): OpenAI {
  // IMAGE_BASE_URL supports OpenAI-compatible /images endpoints; default is
  // api.openai.com even when the text provider is a gateway.
  return new OpenAI({
    apiKey: imageApiKey(),
    ...(env.IMAGE_BASE_URL ? { baseURL: env.IMAGE_BASE_URL } : {}),
  });
}

function qualityOpt(model: string) {
  return model.startsWith('gpt-image') ? { quality: env.IMAGE_QUALITY } : {};
}

async function toBuffer(first: { b64_json?: string; url?: string } | undefined): Promise<Buffer | null> {
  if (first?.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first?.url) {
    const res = await fetch(first.url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

async function openaiGenerate(prompt: string): Promise<Buffer | null> {
  const model = imageModelId('openai');
  const image = await openaiClient().images.generate({
    model,
    prompt,
    n: 1,
    size: '1024x1024',
    ...qualityOpt(model),
  });
  return toBuffer(image.data?.[0]);
}

async function openaiEdit(prompt: string, rawSources: SourceImage[]): Promise<Buffer | null> {
  const model = imageModelId('openai');
  const sources = await Promise.all(rawSources.map(normalizeSource));
  const files = await Promise.all(
    sources.map((s, i) => toFile(s.data, `source-${i}.${s.mime.split('/')[1] ?? 'png'}`, { type: s.mime })),
  );
  const image = await openaiClient().images.edit({
    model,
    image: files.length === 1 ? files[0] : files,
    prompt,
    size: '1024x1024',
    ...qualityOpt(model),
  });
  return toBuffer(image.data?.[0]);
}

// ---- chat-based image models ---------------------------------------------

interface ChatImageMessage {
  images?: { image_url?: { url?: string } }[];
  content?: unknown;
}

async function chatImage(prompt: string, rawSources: SourceImage[]): Promise<Buffer | null> {
  const client = new OpenAI({
    apiKey: imageApiKey(),
    baseURL: env.IMAGE_BASE_URL ?? env.AI_BASE_URL ?? OPENROUTER_BASE_URL,
  });
  const sources = await Promise.all(rawSources.map(normalizeSource));

  const content: object[] = [{ type: 'text', text: prompt }];
  sources.forEach((s, i) => {
    const label = rawSources[i]?.label;
    if (label) content.push({ type: 'text', text: label });
    content.push({
      type: 'image_url',
      image_url: { url: `data:${s.mime};base64,${s.data.toString('base64')}` },
    });
  });

  const res = await client.chat.completions.create({
    model: imageModelId('chat'),
    messages: [{ role: 'user', content }],
    // Non-standard but OpenAI-SDK-tolerated: ask for image output.
    modalities: ['image', 'text'],
  } as never);

  const message = (res as { choices?: { message?: ChatImageMessage }[] }).choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url;
  if (url?.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    return Buffer.from(b64, 'base64');
  }
  if (url) {
    const fetched = await fetch(url);
    if (fetched.ok) return Buffer.from(await fetched.arrayBuffer());
  }
  return null;
}

// ---- public API -----------------------------------------------------------

export async function generateImage(prompt: string): Promise<Buffer | null> {
  const provider = resolveImageProvider();
  if (provider === 'none') return null;
  return provider === 'openai' ? openaiGenerate(prompt) : chatImage(prompt, []);
}

export async function editImage(prompt: string, sources: SourceImage[]): Promise<Buffer | null> {
  const provider = resolveImageProvider();
  if (provider === 'none') return null;
  return provider === 'openai' ? openaiEdit(prompt, sources) : chatImage(prompt, sources);
}

export function imagesEnabled(): boolean {
  return resolveImageProvider() !== 'none';
}
