import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { chatInstructions } from './chat';
import { setting } from './settings';

// Replies to ambassador candidates who answer the LinkedIn message with a question. Written in Pierre's name, in French,
// from the same facts as the site assistant. Anything sensitive or unknown is handed to Pierre instead of answered.

export type Turn = { from: 'pierre' | 'student'; text: string };
export type ReplyResult = { reply: string; needsHuman: boolean; declined: boolean; reason: string; contact: string };

const PROGRAMME = `# The ambassador programme (what Pierre is recruiting for)
- One ambassador per school. The ambassador represents The AI Certification on their campus: tells students, associations and the BDE about the AI certification.
- The ambassador earns 10 % commission on every sale made by students of their school. Joining is free; nothing has to be bought. Commissions come only from real purchases.
- Commissions are paid by bank transfer from the ambassador space. To receive them in France the ambassador needs a business status, for example a micro-entreprise.
- The ambassador must be honest: say they earn a commission, say the certificate is a private certificate (not a university diploma), and that The AI Certification is independent from schools. No spam.
- Next step for any interested student: Pierre explains everything on the channel the student prefers (Instagram, WhatsApp, phone, e-mail, or here on LinkedIn). A video call with Pierre is possible too, booked on their personal link, only if the student asks for a call. Full terms: {base}/ambassador-terms
- Schools where The AI Certification already has an ambassador: ESCP, EDHEC, emlyon, SKEMA, IÉSEG, Polytechnique, NEOMA, ESSCA, ESSEC.`;

export async function draftReply(input: { firstName: string; school: string; link: string; base: string; history: Turn[] }): Promise<ReplyResult> {
  const apiKey = await setting('ANTHROPIC_API_KEY');
  if (!apiKey) return { reply: '', needsHuman: true, declined: false, reason: 'Clé Claude absente', contact: '' };

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
            declined: { type: 'boolean', description: 'true when the student says no, is not interested, or asks not to be contacted again' },
            reason: { type: 'string', description: 'One short line in French: why it needs Pierre, or what was answered' },
            contact: { type: 'string', description: 'The contact the student gave in their last messages, with its channel, copied exactly (e.g. "Instagram : @lea.dupont", "WhatsApp : 06 12 34 56 78"). Empty when none was given.' },
          },
          required: ['reply', 'needs_human', 'declined', 'reason', 'contact'],
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
- French, "tu". Write exactly like a 22-year-old founder typing a LinkedIn DM on his phone to another student, not like a brand or an assistant: 1 to 3 short sentences, everyday spoken French ("t’es", "ça te dit", "pas de souci", "carrément", "vite fait"), plain words ("certif", "asso"). Plain text, no list, one emoji at most and usually none. Sign nothing.
- Never sound like marketing or customer service: no "Avec plaisir", "N’hésite pas", "Je serais ravi", "Concrètement", "En effet", no exclamation in every sentence, no restating their question, no summary of the whole programme. Answer the one thing they asked, then one short question back at most.
- Match their register and length: a two-word message gets a short line back, a casual message gets a casual answer.
- Answer the student's question only from the facts above. Never invent a figure, date, partnership, guarantee or promise of income.
- The goal is not to send a link: it is to learn where the student prefers to talk, so Pierre can carry on there. When it fits, end by asking where it is simplest for them (Insta, WhatsApp, here…), in your own words, never as a form. If they prefer to stay on LinkedIn, simply keep answering here.
- When the student gives a contact (Instagram handle, WhatsApp or phone number, Snapchat, e-mail, anything): copy it exactly into contact with its channel, and reply one short warm line saying Pierre writes to them there very soon (needs_human false). Never ask for a second contact, never comment on the channel they chose, never promise a precise time.
- Only when the student asks for a call or a meeting, give their personal booking link: ${input.link}
- Set needs_human to true (and leave reply empty) when: the question is outside these facts, it is about a payment, refund, complaint, legal or personal matter, the student is upset, or the message is not a question you can answer safely.
- If the student declines in any way ("non merci", "pas intéressé", "pas le temps", "stop", "ne me contacte plus"…): declined true, and reply one short, warm line that thanks them and wishes them well, with no link and no attempt to convince them (needs_human false). If they also sound upset, leave reply empty and set needs_human true.`,
      },
    ],
    messages: [{ role: 'user', content: `Conversation LinkedIn (le dernier message est celui de l'étudiant, auquel il faut répondre) :\n\n${conversation}` }],
  });

  if (response.stop_reason === 'refusal') return { reply: '', needsHuman: true, declined: false, reason: 'Réponse refusée par le modèle', contact: '' };
  const text = response.content.find((b) => b.type === 'text');
  try {
    const out = JSON.parse(text && text.type === 'text' ? text.text : '');
    const reply = String(out.reply ?? '').trim();
    return { reply, needsHuman: !!out.needs_human || (!reply && !out.declined), declined: !!out.declined, reason: String(out.reason ?? ''), contact: String(out.contact ?? '').trim() };
  } catch {
    return { reply: '', needsHuman: true, declined: false, reason: 'Réponse illisible', contact: '' };
  }
}
