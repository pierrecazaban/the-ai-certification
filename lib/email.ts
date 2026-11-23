import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from './db';
import { company } from './company';
import { member } from './i18n/member';
import { setting } from './settings';
import { formatDate, LOCALES, type Locale } from './locales';
import { siteUrl } from '@/lib/site';
import { SITE_DOMAIN, SITE_NAME } from './site';
import { daysFor, pace, planDays } from './i18n/pace';
import { getCourse } from './learning';
import { STUDENT_PROGRAM } from './catalog';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(locale: Locale, body: string) {
  const t = member(locale).email;
  return `<!doctype html><html lang="${LOCALES[locale].lang}"><body style="margin:0;background:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#17274C">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(23,39,76,.10)">
<div style="background:#17274C;padding:18px 28px">
<img src="${base()}/assets/logo-email-white.png" width="133" height="30" alt="AI Certification" style="display:block;border:0">
</div>
<div style="background:#FBF3E2;text-align:center;padding:24px 0 0">
<img src="${base()}/assets/kai-email.png" width="170" height="170" alt="" style="display:block;margin:0 auto;border:0">
</div>
<div style="padding:28px">${body}</div>
</div>
<div style="background:#FFF4E5;border:1px solid #F5C77E;border-radius:14px;padding:16px 18px;margin:20px 0 0">
<p style="font-size:15px;font-weight:700;margin:0 0 4px;color:#7A4100">${esc(t.noReply)}</p>
<p style="font-size:14px;margin:0 0 14px;color:#7A4100">${esc(t.helpQuestion)}</p>
<a href="${esc(`${base()}/support?lang=${locale}`)}" style="display:inline-block;background:#17274C;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:999px">${esc(t.helpButton)} &rarr;</a>
</div>
<p style="font-size:12px;color:#4A5370;margin:20px 0 0;text-align:center">${esc(company.name ? t.footer(company.name) : SITE_NAME)} · <a href="${esc(base())}" style="color:#4A5370">${esc(SITE_DOMAIN)}</a></p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0;text-align:center"><a href="${esc(href)}" style="display:inline-block;background:#FFB020;color:#17274C;text-decoration:none;font-weight:700;font-size:16px;padding:16px 32px;border-radius:999px">${esc(label)} &rarr;</a></p>`;

/**
 * Sends an email through SMTP (SMTP_USER/SMTP_PASS, e.g. Gmail) or Resend (RESEND_API_KEY) when configured. Every email is also kept
 * in the `emails` table so the admin can see it; without a key it is only stored (and logged in development).
 */
async function send(input: { to: string; subject: string; html: string; kind: string; locale: Locale; registrationId?: string }) {
  const id = randomUUID();
  let status = 'stored';
  let providerId: string | null = null;
  let error: string | null = null;
  let resendKey: string | undefined;

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    // SMTP, e.g. Gmail with an app password: SMTP_USER=you@gmail.com.
    try {
      const nodemailer = (await import('nodemailer')).default;
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: Number(process.env.SMTP_PORT ?? 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const info = await transport.sendMail({
        from: (await setting('EMAIL_FROM')) ?? `The AI Certification <${process.env.SMTP_USER}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      status = 'sent';
      providerId = info.messageId ?? null;
    } catch (err) {
      status = 'failed';
      error = String(err).slice(0, 500);
    }
  } else if ((resendKey = await setting('RESEND_API_KEY'))) {
    try {
      const res = await fetch(`${(process.env.NODE_ENV !== 'production' && process.env.RESEND_API_BASE) || 'https://api.resend.com'}/emails`, {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: (await setting('EMAIL_FROM')) ?? `${SITE_NAME} <noreply@${SITE_DOMAIN}>`,
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        status = 'sent';
        providerId = data.id ?? null;
      } else {
        status = 'failed';
        error = JSON.stringify(data).slice(0, 500);
      }
    } catch (err) {
      status = 'failed';
      error = String(err).slice(0, 500);
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.log(`[email:${input.kind}] to ${input.to}: ${input.subject}`);
  }

  await sql(
    `insert into emails (id, to_email, subject, kind, locale, html, status, provider_id, error, registration_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, input.to, input.subject, input.kind, input.locale, input.html, status, providerId, error, input.registrationId ?? null],
  );
  return status;
}

/** True when emails can actually be delivered (SMTP or Resend). */
export async function emailConfigured() {
  return Boolean((process.env.SMTP_USER && process.env.SMTP_PASS) || (await setting('RESEND_API_KEY')));
}

const base = () => siteUrl();

export function loginUrl(token: string, locale: Locale) {
  return `${base()}/login/password?token=${encodeURIComponent(token)}&lang=${locale}`;
}

export function sendLoginEmail(to: string, token: string, locale: Locale) {
  const t = member(locale).email;
  const html = layout(
    locale,
    `<p style="font-size:16px;margin:0">${esc(t.loginIntro)}</p>${button(loginUrl(token, locale), t.loginButton)}<p style="font-size:13px;color:#4A5370;margin:0">${esc(t.ignore)}</p>`,
  );
  return send({ to, subject: t.loginSubject, html, kind: 'login', locale });
}

// Rythme conseillé (23/11) : le plan jour par jour dans le mail de confirmation du cours étudiant, dans le style de
// l'espace élève (carte blanche, pastilles dorées, « Module » en bleu pâle, examen en bleu nuit). Tableaux : les
// messageries ignorent flex et grid.
function planHtml(locale: Locale) {
  const modules = getCourse(STUDENT_PROGRAM, locale)?.modules.length ?? 0;
  if (!modules) return '';
  const p = pace(locale);
  const pill = (txt: string, exam = false) =>
    `<span style="display:inline-block;margin:3px 6px 3px 0;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:700;${exam ? 'background:#17274C;color:#fff' : 'background:#E9EEFA;color:#1F3A75'}">${exam ? '<span style="color:#FBC531">&#9733;</span> ' : ''}${esc(txt)}</span>`;
  const rows = planDays(modules).map((d) => `<tr>
<td style="width:42px;padding:6px 14px 6px 0;vertical-align:middle"><div style="width:40px;height:40px;line-height:40px;text-align:center;border-radius:13px;background:#F8C239;color:#17274C;font-weight:800;font-size:17px">${d.day}</div></td>
<td style="padding:6px 0;vertical-align:middle"><span style="font-weight:800;margin-right:8px">${esc(p.day(d.day))}</span>${d.modules.map((n) => pill(p.moduleLabel(n))).join('')}${d.exam ? pill(p.examLabel, true) : ''}</td></tr>`).join('');
  return `<div style="margin:24px 0 0;background:#fff;border:1px solid #EEF1F6;border-radius:22px;padding:22px 22px 16px">
<div style="width:44px;height:3px;border-radius:2px;background:#F5B82E;margin:0 0 12px"></div>
<p style="margin:0;color:#6B7590;letter-spacing:3px;font-weight:700;font-size:11px;text-transform:uppercase">${esc(p.planTitle)}</p>
<p style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.2">${esc(p.certIn(daysFor(modules)))}</p>
<p style="margin:0 0 12px;color:#4A5370;font-size:14.5px;line-height:1.5">${esc(p.tipShort)}</p>
<table style="border-collapse:collapse">${rows}</table></div>`;
}

export function sendConfirmationEmail(input: {
  to: string;
  name: string;
  reference: string;
  university?: string | null;
  certification?: string | null;
  startsAt: string;
  amount: string;
  locale: Locale;
  registrationId: string;
}) {
  const t = member(input.locale).email;
  const row = (k: string, v: string, last = false) =>
    `<tr><td style="padding:10px 0;color:#4A5370;${last ? '' : 'border-bottom:1px solid #E1E5EC'}">${esc(k)}</td><td style="padding:10px 0;text-align:right;font-weight:700;${last ? '' : 'border-bottom:1px solid #E1E5EC'}">${esc(v)}</td></tr>`;
  const html = layout(
    input.locale,
    `<p style="margin:0 0 12px"><span style="display:inline-block;background:#EAEFF8;color:#1F3A75;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px">&#10003; ${esc(t.confirmBadge)}</span></p>
<p style="font-size:24px;line-height:1.25;font-weight:800;margin:0 0 20px">${esc(t.confirmIntro(input.name))}</p>
<div style="background:#F7F8FA;border-radius:14px;padding:6px 18px">
<table style="width:100%;border-collapse:collapse;font-size:14px">${row(t.reference, input.reference)}${input.certification ? row('Certification', input.certification) : ''}${input.university ? row(t.university, input.university) : ''}${row(t.paid, input.amount, true)}</table>
</div>
${input.certification ? '' : planHtml(input.locale)}<p style="font-size:15px;line-height:1.5;margin:22px 0 0">${esc(t.confirmNext)}</p>${button(`${base()}/login?lang=${input.locale}`, t.spaceButton)}
<p style="font-size:12px;color:#4A5370;margin:0;text-align:center">${esc(t.receipt)}</p>`,
  );
  return send({ to: input.to, subject: t.confirmSubject(input.reference), html, kind: 'confirmation', locale: input.locale, registrationId: input.registrationId });
}

const TICKET_TEXT = {
  fr: {
    received: (ref: string) => `Nous avons bien reçu ta demande (${ref})`,
    receivedIntro: 'Merci ! Ta demande est enregistrée. Nous te répondons par email sous 7 jours ouvrés. Voici ton message :',
    reply: (ref: string) => `Réponse à ta demande ${ref}`,
    replyIntro: 'Voici notre réponse :',
    followUp: 'Pour donner une suite, ouvre une nouvelle demande et indique cette référence.',
  },
  en: {
    received: (ref: string) => `We received your request (${ref})`,
    receivedIntro: 'Thanks! Your request is logged. We answer by email within 7 working days. Here is your message:',
    reply: (ref: string) => `Answer to your request ${ref}`,
    replyIntro: 'Here is our answer:',
    followUp: 'To follow up, open a new request and mention this reference.',
  },
};

/** Ticket emails: the acknowledgement when a request is opened, and each answer from the team. */
export function sendTicketEmail(input: { to: string; reference: string; locale: Locale; kind: 'received' | 'reply'; body: string }) {
  const t = input.locale === 'fr' ? TICKET_TEXT.fr : TICKET_TEXT.en;
  const quote = `<div style="white-space:pre-line;background:#F7F8FA;border-radius:12px;padding:16px;margin:12px 0;font-size:15px">${esc(input.body)}</div>`;
  const html =
    input.kind === 'received'
      ? layout(input.locale, `<p style="font-size:16px;margin:0">${esc(t.receivedIntro)}</p>${quote}${button(`${base()}/support?lang=${input.locale}`, `${SITE_DOMAIN}/support`)}`)
      : layout(input.locale, `<p style="font-size:16px;margin:0">${esc(t.replyIntro)}</p>${quote}<p style="font-size:13px;color:#4A5370">${esc(t.followUp)} (${esc(input.reference)})</p>`);
  return send({ to: input.to, subject: input.kind === 'received' ? t.received(input.reference) : t.reply(input.reference), html, kind: `ticket_${input.kind}`, locale: input.locale });
}

// Relance des clients pas encore certifiés (23/11), envoyée une fois depuis l'admin. Texte demandé par Pierre en français.
export const FINISH_NUDGE_TEXT: Record<'fr' | 'en' | 'es' | 'it' | 'de', { subject: string; hello: (name: string) => string; line: string; linkedin: string; button: string }> = {
  fr: {
    subject: 'Finissez votre formation en une soirée',
    hello: (n) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    line: 'Finissez votre formation en une soirée pour être certifié sur LinkedIn.',
    linkedin: 'Une fois l’examen réussi, votre certificat s’ajoute à votre profil LinkedIn en un clic.',
    button: 'Reprendre ma formation',
  },
  en: {
    subject: 'Finish your course in one evening',
    hello: (n) => (n ? `Hi ${n},` : 'Hi,'),
    line: 'Finish your course in one evening and get certified on LinkedIn.',
    linkedin: 'Once you pass the exam, your certificate goes on your LinkedIn profile in one click.',
    button: 'Resume my course',
  },
  es: {
    subject: 'Termina tu formación en una tarde',
    hello: (n) => (n ? `Hola ${n}:` : 'Hola:'),
    line: 'Termina tu formación en una tarde y obtén tu certificación en LinkedIn.',
    linkedin: 'Cuando apruebes el examen, tu certificado se añade a tu perfil de LinkedIn con un clic.',
    button: 'Retomar mi formación',
  },
  it: {
    subject: 'Finisci il tuo corso in una serata',
    hello: (n) => (n ? `Ciao ${n},` : 'Ciao,'),
    line: 'Finisci il tuo corso in una serata e ottieni la certificazione su LinkedIn.',
    linkedin: 'Superato l’esame, il certificato si aggiunge al tuo profilo LinkedIn con un clic.',
    button: 'Riprendi il corso',
  },
  de: {
    subject: 'Schließe deinen Kurs an einem Abend ab',
    hello: (n) => (n ? `Hallo ${n},` : 'Hallo,'),
    line: 'Schließe deinen Kurs an einem Abend ab und werde auf LinkedIn zertifiziert.',
    linkedin: 'Nach bestandener Prüfung kommt dein Zertifikat mit einem Klick in dein LinkedIn-Profil.',
    button: 'Kurs fortsetzen',
  },
};

export const finishNudgeText = (locale: Locale) => FINISH_NUDGE_TEXT[(LOCALES[locale]?.lang ?? 'en') as keyof typeof FINISH_NUDGE_TEXT] ?? FINISH_NUDGE_TEXT.en;

/** No duplicate, whatever the caller did (23/11): true when a mail of this kind already left for this address. */
async function alreadySent(to: string, kindPrefix: string) {
  const [row] = await sql(`select 1 from emails where lower(to_email) = lower($1) and kind like $2 and status = 'sent' limit 1`, [to, `${kindPrefix}%`]);
  return Boolean(row);
}

export async function sendFinishNudgeEmail(input: { to: string; firstName: string; locale: Locale; registrationId: string }) {
  if (await alreadySent(input.to, 'finish_nudge')) return 'duplicate';
  const t = finishNudgeText(input.locale);
  const html = layout(
    input.locale,
    `<p style="font-size:16px;margin:0 0 12px">${esc(t.hello(input.firstName))}</p>
<p style="font-size:22px;line-height:1.3;font-weight:800;margin:0 0 12px">${esc(t.line)}</p>
<p style="font-size:15px;line-height:1.5;margin:0">${esc(t.linkedin)}</p>${button(`${base()}/space?lang=${input.locale}`, t.button)}`,
  );
  return send({ to: input.to, subject: t.subject, html, kind: 'finish_nudge', locale: input.locale, registrationId: input.registrationId });
}

// Rappel de paiement (23/11) : une inscription commencée, pas payée. Remplace les relances que Smart Mail envoyait depuis
// la boîte de l'ambassadeur. Étape 1 : il ne manque que le paiement. Étape 2 : la veille de la clôture.
type PayText = { subject: [string, string]; hello: (name: string) => string; line: [string, string]; body: [string, string]; closes: (day: string) => string; button: string; stop: string };
export const PAY_REMINDER_TEXT: Record<'fr' | 'en' | 'es' | 'it' | 'de', PayText> = {
  fr: {
    subject: ['Ton inscription n’est pas terminée', 'Dernier rappel : les inscriptions ferment demain'],
    hello: (n) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    line: ['Ta place n’est pas encore confirmée : il ne manque que le paiement.', 'Les inscriptions ferment demain soir : ta place n’est pas encore confirmée.'],
    body: ['Tes informations sont déjà remplies, il reste 2 minutes pour finaliser ton inscription à The AI Certification.', 'Il ne manque que le paiement. Tes informations sont déjà remplies, ça prend 2 minutes.'],
    closes: (d) => `Les inscriptions ferment ${d}.`,
    button: 'Finaliser mon inscription',
    stop: 'Ne plus recevoir de rappel',
  },
  en: {
    subject: ['Your registration isn’t finished', 'Last reminder: registration closes tomorrow'],
    hello: (n) => (n ? `Hi ${n},` : 'Hi,'),
    line: ['Your place isn’t confirmed yet: only the payment is missing.', 'Registration closes tomorrow night: your place isn’t confirmed yet.'],
    body: ['Your details are already filled in. It takes 2 minutes to finish registering for The AI Certification.', 'Only the payment is missing. Your details are already filled in, it takes 2 minutes.'],
    closes: (d) => `Registration closes on ${d}.`,
    button: 'Finish my registration',
    stop: 'Stop reminders',
  },
  es: {
    subject: ['Tu inscripción no está terminada', 'Último aviso: las inscripciones cierran mañana'],
    hello: (n) => (n ? `Hola ${n}:` : 'Hola:'),
    line: ['Tu plaza aún no está confirmada: solo falta el pago.', 'Las inscripciones cierran mañana por la noche: tu plaza aún no está confirmada.'],
    body: ['Tus datos ya están rellenados. Terminar tu inscripción en The AI Certification lleva 2 minutos.', 'Solo falta el pago. Tus datos ya están rellenados, son 2 minutos.'],
    closes: (d) => `Las inscripciones cierran el ${d}.`,
    button: 'Terminar mi inscripción',
    stop: 'No recibir más recordatorios',
  },
  it: {
    subject: ['La tua iscrizione non è completa', 'Ultimo promemoria: le iscrizioni chiudono domani'],
    hello: (n) => (n ? `Ciao ${n},` : 'Ciao,'),
    line: ['Il tuo posto non è ancora confermato: manca solo il pagamento.', 'Le iscrizioni chiudono domani sera: il tuo posto non è ancora confermato.'],
    body: ['I tuoi dati sono già compilati. Bastano 2 minuti per completare l’iscrizione a The AI Certification.', 'Manca solo il pagamento. I tuoi dati sono già compilati, bastano 2 minuti.'],
    closes: (d) => `Le iscrizioni chiudono ${d}.`,
    button: 'Completa l’iscrizione',
    stop: 'Non ricevere più promemoria',
  },
  de: {
    subject: ['Deine Anmeldung ist noch nicht abgeschlossen', 'Letzte Erinnerung: Die Anmeldung schließt morgen'],
    hello: (n) => (n ? `Hallo ${n},` : 'Hallo,'),
    line: ['Dein Platz ist noch nicht bestätigt: Es fehlt nur die Zahlung.', 'Die Anmeldung schließt morgen Abend: Dein Platz ist noch nicht bestätigt.'],
    body: ['Deine Angaben sind schon ausgefüllt. Der Abschluss deiner Anmeldung bei The AI Certification dauert 2 Minuten.', 'Es fehlt nur die Zahlung. Deine Angaben sind schon ausgefüllt, es dauert 2 Minuten.'],
    closes: (d) => `Die Anmeldung schließt am ${d}.`,
    button: 'Anmeldung abschließen',
    stop: 'Keine Erinnerungen mehr erhalten',
  },
};

export const payReminderText = (locale: Locale) => PAY_REMINDER_TEXT[(LOCALES[locale]?.lang ?? 'en') as keyof typeof PAY_REMINDER_TEXT] ?? PAY_REMINDER_TEXT.en;

export async function sendPayReminderEmail(input: { to: string; firstName: string; locale: Locale; step: 1 | 2; link: string; deadline: string; registrationId: string }) {
  if (await alreadySent(input.to, 'pay_reminder')) return 'duplicate';
  const t = payReminderText(input.locale);
  const i = input.step - 1;
  const html = layout(
    input.locale,
    `<p style="font-size:16px;margin:0 0 12px">${esc(t.hello(input.firstName))}</p>
<p style="font-size:22px;line-height:1.3;font-weight:800;margin:0 0 12px">${esc(t.line[i])}</p>
<p style="font-size:15px;line-height:1.5;margin:0">${esc(t.body[i])}${input.step === 1 ? ` ${esc(t.closes(formatDate(input.deadline, input.locale)))}` : ''}</p>${button(input.link, t.button)}
<p style="font-size:12px;margin:0;text-align:center"><a href="${esc(input.link.replace('/finish?', '/stop?'))}" style="color:#4A5370">${esc(t.stop)}</a></p>`,
  );
  return send({ to: input.to, subject: t.subject[i], html, kind: `pay_reminder_${input.step}`, locale: input.locale, registrationId: input.registrationId });
}

/** Trouble with the automatic reminders (clock stopped, quota, refused mails): a short mail to the admin. */
export async function sendRelanceAlert(input: { subject: string; lines: string[] }) {
  const to = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).find(Boolean);
  if (!to) return 'skipped';
  const html = layout('fr', input.lines.map((l) => `<p style="font-size:15px;margin:0 0 8px;white-space:pre-line">${esc(l)}</p>`).join('') + button(`${base()}/admin?tab=etudiants`, 'Ouvrir l’admin'));
  return send({ to, subject: input.subject, html, kind: 'relance_alert', locale: 'fr' });
}

/** "Tester" button of the admin settings: a short email to the admin. */
export function sendTestEmail(to: string) {
  const html = layout('fr', '<p style="font-size:18px;font-weight:800;margin:0 0 8px">Test réussi</p><p style="font-size:15px;margin:0">Les e-mails de The AI Certification partent correctement.</p>');
  return send({ to, subject: 'The AI Certification : test d’envoi des e-mails', html, kind: 'test', locale: 'fr' });
}

/** Welcome email of a new ambassador: the link to choose a password and the terms of the programme. */
export function sendAmbassadorWelcome(input: { to: string; firstName: string; token: string; ownerRate: number; parentRate: number; secondRate: number; termsVersion: string }) {
  const li = (s: string) => `<li style="margin:0 0 8px">${s}</li>`;
  const html = layout(
    'en-us',
    `<p style="font-size:22px;font-weight:800;margin:0 0 12px">Welcome to the ambassador programme${input.firstName ? `, ${esc(input.firstName)}` : ''}!</p>
<p style="font-size:15px;line-height:1.5;margin:0">Choose your password to open your ambassador space. The link works once and is valid for 7 days.</p>
${button(loginUrl(input.token, 'en-us'), 'Choose my password')}
<p style="font-weight:800;margin:8px 0 8px">Your ambassador terms (version ${esc(input.termsVersion)}), in short</p>
<ul style="padding-left:20px;margin:0;font-size:14px;line-height:1.5">
${li(`You earn <strong>${input.ownerRate} %</strong> of every payment made by a student of your schools, <strong>${input.parentRate} %</strong> of the payments at the schools of the ambassadors you invite directly, and <strong>${input.secondRate} %</strong> at the schools of the ambassadors they invite (nothing further down).`)}
${li('Joining is free, nothing has to be bought, and nothing is earned just for recruiting: every commission comes from a real student purchase. That is what makes the programme legal (it is not a pyramid scheme).')}
${li('A commission is recorded when the student’s payment is confirmed, and cancelled if the payment is refunded or disputed.')}
${li('Add your IBAN in your space and request a payout: The AI Certification sends the funds by bank transfer within 48 hours.')}
${li('Be honest: certifications are private certificates, not university diplomas, The AI Certification is independent from schools, and you must say that you earn a commission. No spam.')}
${li('You are an independent partner, responsible for declaring your income.')}
</ul>
<p style="margin:16px 0 0"><a href="${esc(`${base()}/ambassador-terms`)}" style="color:#1F3A75;font-weight:700">Read the full ambassador terms →</a></p>
<p style="font-size:11px;color:#4A5370;margin:20px 0 0">To receive your commissions in France you need a business status, for example a micro-entreprise (auto-entrepreneur). Outside France, the equivalent status in your country.</p>`,
  );
  return send({ to: input.to, subject: 'Welcome to The AI Certification ambassador programme', html, kind: 'ambassador_welcome', locale: 'en-us' });
}

/** Confirmation of an ambassador call booked on /call: day, time and the video link. In French, like /call. */
export function sendCallBookedEmail(input: { to: string; firstName: string; when: string; meetUrl: string; reference: string; manageUrl: string }) {
  const html = layout(
    'fr',
    `<p style="margin:0 0 12px"><span style="display:inline-block;background:#EAEFF8;color:#1F3A75;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px">&#10003; Appel confirmé</span></p>
<p style="font-size:22px;line-height:1.25;font-weight:800;margin:0 0 12px">À très vite${input.firstName ? `, ${esc(input.firstName)}` : ''} !</p>
<p style="font-size:15px;line-height:1.5;margin:0">On se retrouve <strong>${esc(input.when)}</strong> (heure de Paris) pour 45 minutes autour du programme ambassadeurs de The AI Certification.</p>
${button(input.meetUrl, 'Rejoindre l’appel')}
<p style="font-size:13px;color:#4A5370;margin:0;word-break:break-all">Lien de l’appel : <a href="${esc(input.meetUrl)}" style="color:#1F3A75">${esc(input.meetUrl)}</a></p>
<p style="font-size:13px;color:#4A5370;margin:12px 0 0">Récapitulatif de ton rendez-vous : <a href="${esc(input.manageUrl)}" style="color:#1F3A75">${esc(input.reference)}</a></p>`,
  );
  return send({ to: input.to, subject: `Ton appel avec The AI Certification : ${input.when}`, html, kind: 'call_booked', locale: 'fr' });
}

/** Prospection: tells the admin that a student gave a contact, or that a LinkedIn reply is waiting for him. */
export async function sendOutreachAlert(input: { subject: string; lines: string[]; linkedin?: string }) {
  const to = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).find(Boolean);
  if (!to) return 'skipped';
  const html = layout('fr', input.lines.map((l) => `<p style="font-size:15px;margin:0 0 8px;white-space:pre-line">${esc(l)}</p>`).join('') + (input.linkedin ? button(input.linkedin, 'Ouvrir le profil LinkedIn') : ''));
  return send({ to, subject: input.subject, html, kind: 'outreach_alert', locale: 'fr' });
}
