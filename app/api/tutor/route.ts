import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { STUDENT_PROGRAM } from '@/lib/catalog';
import { hasCourse } from '@/lib/learning';
import { getProgress, hasPaidAccess } from '@/lib/learning/progress';
import { setting } from '@/lib/settings';
import { tutorInstructions, tutorSituation } from '@/lib/tutor';

export const dynamic = 'force-dynamic';

// Kai, the course assistant of the module pages (24/11, components/learning/Tutor): answers the learner's questions
// about the modules, with the whole course in its prompt. Signed-in learners of the course only. Streams plain text,
// like the site assistant (app/api/chat). Same Anthropic key, set in /admin › Settings.

const MAX_TURNS = 24;
const MAX_CHARS = 2000;
const PER_HOUR = 40;

// Per learner and per server instance: enough to stop a runaway tab, not a quota.
const hits = new Map<string, number[]>();
function rateLimited(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > PER_HOUR;
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const program = typeof body?.program === 'string' ? body.program : '';
  if (!hasCourse(program)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Same rule as the course pages (components/learning/learner.ts): admins and ambassadors follow the student course
  // without paying, everyone else needs a paid registration.
  const free = user.role === 'admin' || (user.role === 'ambassador' && program === STUDENT_PROGRAM);
  if (!free && !(await hasPaidAccess(user.id, program))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const apiKey = await setting('ANTHROPIC_API_KEY');
  if (!apiKey) return NextResponse.json({ error: 'disabled' }, { status: 503 });
  if (rateLimited(user.id)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const progress = await getProgress(user.id, user.locale, program);
  if (!progress) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { course, locale } = progress;
  const moduleIndex = course.modules.findIndex((m) => m.id === body?.module);

  const raw: unknown[] = Array.isArray(body?.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const messages: Anthropic.Beta.BetaMessageParam[] = raw
    .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
      !!m && typeof m === 'object' && ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant')
      && typeof (m as { content?: unknown }).content === 'string' && (m as { content: string }).content.trim() !== '')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  // The conversation must start with the learner and end with their new message.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'empty' }, { status: 400 });

  // Only letters in the first name: it goes into the prompt.
  const firstName = user.first_name.replace(/[^\p{L}\p{M}' -]/gu, '').trim().slice(0, 40);
  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 6000,
    // Thinking is always on with this model; "medium" keeps the answers quick and careful (same as the site assistant).
    output_config: { effort: 'medium' },
    // If a safety filter declines a question, the API retries it on another model instead of leaving the learner without an answer.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      // The course in the learner's language: the same text for every learner, so the API caches it.
      { type: 'text', text: tutorInstructions(course, locale), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: tutorSituation(course, moduleIndex, progress.modules[moduleIndex] ?? null, firstName) },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') controller.enqueue(encoder.encode(event.delta.text));
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') controller.enqueue(encoder.encode('\n\n[…]'));
      } catch (error) {
        console.error('[tutor]', error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error);
        controller.enqueue(encoder.encode('\n\n[…]'));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(readable, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
