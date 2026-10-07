import type { AIProvider, RefineIntent } from './types';
import { localProvider, typeIsValid } from './local';
import type { ContentItem } from '../domain/types';
import { CONTENT_TYPES, TYPE_LABEL } from '../domain/constants';

const SYSTEM = `You are the quiet creative assistant inside YOUrigin, a writer's private studio.
The writer is the author. You notice, suggest and ask; you never take over.
Preserve the writer's voice, vocabulary, line breaks and strangeness. Never moralise or judge quality.
"Seed" means raw and alive, not bad. Keep suggestions short and concrete.`;

type Client = import('@anthropic-ai/sdk').default;
let client: { key: string; c: Client } | null = null;

async function getClient(apiKey: string): Promise<Client> {
  if (client?.key === apiKey) return client.c;
  // Loaded on demand so the offline app never pays for the SDK unless Claude is enabled.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key belongs to the person using this device and is stored only on it.
  const c = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 });
  client = { key: apiKey, c };
  return c;
}

async function askJSON<T>(apiKey: string, model: string, prompt: string, schema: object, maxTokens = 2000): Promise<T> {
  const c = await getClient(apiKey);
  const response = await c.beta.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  } as never);
  const msg = response as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = msg.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Empty response');
  return JSON.parse(text) as T;
}

function piece(item: ContentItem): string {
  return `<piece type="${TYPE_LABEL[item.type]}" status="${item.status}">\n${item.title ? item.title + '\n\n' : ''}${item.body}\n</piece>`;
}

const REFINE_ASK: Record<RefineIntent, string> = {
  tighten: 'Offer a tightened version: cut what is not needed, keep every image that carries weight.',
  imagery: 'Offer a version where abstract statements become concrete images, keeping the same arc.',
  ending: 'Offer the same piece with a different ending (only the ending changes).',
  clarity: 'Offer a clearer version that keeps the voice, line breaks and mystery.',
};

/** Claude-backed provider. Any failure (offline, bad key, rate limit) falls back to on-device suggestions. */
export function claudeProvider(apiKey: string, model: string): AIProvider {
  const safe = <A extends unknown[], R>(remote: (...a: A) => Promise<R>, local: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return local(...a);
      try {
        return await remote(...a);
      } catch (err) {
        console.warn('[YOUrigin] Claude unavailable, using on-device suggestions:', err);
        return local(...a);
      }
    };

  return {
    ...localProvider,
    id: 'claude',
    label: 'Claude',
    remote: true,

    suggestTags: safe(
      async (item, ctx) => {
        const known = [...new Set(ctx.tagName.values())].slice(0, 200).join(', ');
        const r = await askJSON<{ tags: string[] }>(
          apiKey,
          model,
          `${piece(item)}\n\nSuggest up to 5 short lowercase tags (single words or hyphenated) describing themes, elements or images. Prefer the writer's existing tags when they fit: ${known || '(none yet)'}.`,
          { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'], additionalProperties: false },
        );
        return r.tags.slice(0, 6);
      },
      localProvider.suggestTags,
    ),

    classifyContent: safe(
      async (item) => {
        const r = await askJSON<{ type: string }>(
          apiKey,
          model,
          `${piece(item)}\n\nWhich single form best describes this piece?`,
          { type: 'object', properties: { type: { type: 'string', enum: CONTENT_TYPES } }, required: ['type'], additionalProperties: false },
          200,
        );
        return typeIsValid(r.type) ? r.type : localProvider.classifyContent(item);
      },
      localProvider.classifyContent,
    ),

    suggestDevelopment: safe(
      async (item) => {
        const r = await askJSON<{ questions: string[] }>(
          apiKey,
          model,
          `${piece(item)}\n\nOffer 3-4 short, specific questions or exercises the writer could use to develop this further. Do not rewrite it.`,
          { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'], additionalProperties: false },
        );
        return r.questions;
      },
      localProvider.suggestDevelopment,
    ),

    refine: safe(
      async (item, intent) => {
        const r = await askJSON<{ text: string; notes: string[] }>(
          apiKey,
          model,
          `${piece(item)}\n\n${REFINE_ASK[intent]} Return the alternative in "text" (preserve line breaks) and 1-3 brief notes on what changed.`,
          {
            type: 'object',
            properties: { text: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } },
            required: ['text', 'notes'],
            additionalProperties: false,
          },
          8000,
        );
        return r;
      },
      localProvider.refine,
    ),
  };
}
