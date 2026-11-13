import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { chatInstructions } from './chat';
import { setting } from './settings';

// Replies to ambassador candidates who answer the LinkedIn message with a question. Written in Pierre's name, in French,
// from the same facts as the site assistant. Anything sensitive or unknown is handed to Pierre instead of answered.

export type Turn = { from: 'pierre' | 'student'; text: string };
export type ReplyResult = { reply: string; needsHuman: boolean; reason: string };

const PROGRAMME = `# The ambassador programme (what Pierre is recruiting for)
- One ambassador per school. The ambassador represents The AI Certification on their campus: tells students, associations and the BDE about the AI certification.
- The ambassador earns 10 % commission on every sale made by students of their school. Joining is free; nothing has to be bought. Commissions come only from real purchases.
- Commissions are paid by bank transfer from the ambassador space. To receive them in France the ambassador needs a business status, for example a micro-entreprise.
- The ambassador must be honest: say they earn a commission, say the certificate is a private certificate (not a university diploma), and that The AI Certification is independent from schools. No spam.
- Next step for any interested student: a 45-minute video call with Pierre, booked on their personal link. Full terms: {base}/ambassador-terms
- Schools where The AI Certification already has an ambassador: ESCP, EDHEC, emlyon, SKEMA, IÉSEG, Polytechnique, NEOMA, ESSCA, ESSEC.`;

export async function draftReply(input: { firstName: string; school: string; link: string; base: string; history: Turn[] }): Promise<ReplyResult> {
  const apiKey = await setting('ANTHROPIC_API_KEY');
  if (!apiKey) return { reply: '', needsHuman: true, reason: 'Clé Claude absente' };

  const client = new Anthropic({ apiKey });
  const conversation = input.history.slice(-12).map((t) => `${t.from === 'pierre' ? 'Pierre' : input.firstName || 'Étudiant'} : ${t.text.slice(0, 1500)}`).join('\n');

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            reply: { type: 'string', description: 'The LinkedIn reply, in French, from Pierre. Empty if needs_human.' },
            needs_human: { type: 'boolean', description: 'true when Pierre must answer himself' },
            reason: { type: 'string', description: 'One short line in French: why it needs Pierre, or what was answered' },
          },
          required: ['reply', 'needs_human', 'reason'],
          additionalProperties: false,
        },
      },
    },
    system: [
      { type: 'text', text: chatInstructions(), cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: `${PROGRAMME.replace('{base}', input.base)}

# Your task now
You are not the chat bubble here. You write LinkedIn replies in the name of Pierre Cazaban, co-founder of The AI Certification, to a first-year student he contacted to become the ambassador of their school (${input.school}).
- French, "tu", warm and short: 2 to 4 sentences, plain text, no list, no emoji overload (one at most). Sign nothing.
- Answer the student's question only from the facts above. Never invent a figure, date, partnership, guarantee or promise of income.
- When it fits, end by inviting them to book the 45-minute call on their personal link: ${input.link}
- Set needs_human to true (and leave reply empty) when: the question is outside these facts, it is about a payment, refund, complaint, legal or personal matter, the student is upset or asks to stop, or the message is not a question you can answer safely. If they ask to stop, needs_human true with reason "demande d'arrêt".`,
      },
    ],
    messages: [{ role: 'user', content: `Conversation LinkedIn (le dernier message est celui de l'étudiant, auquel il faut répondre) :\n\n${conversation}` }],
  });

  if (response.stop_reason === 'refusal') return { reply: '', needsHuman: true, reason: 'Réponse refusée par le modèle' };
  const text = response.content.find((b) => b.type === 'text');
  try {
    const out = JSON.parse(text && text.type === 'text' ? text.text : '');
    return { reply: String(out.reply ?? '').trim(), needsHuman: !!out.needs_human || !String(out.reply ?? '').trim(), reason: String(out.reason ?? '') };
  } catch {
    return { reply: '', needsHuman: true, reason: 'Réponse illisible' };
  }
}
