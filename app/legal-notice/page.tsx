import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { company } from '@/lib/company';
import { localeFromSearch } from '@/lib/requestLocale';
import { SITE_DOMAIN } from '@/lib/site';

export const metadata = { title: 'Legal notice | The AI Certification' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STRIPE = 'Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210';

// Legal notice (mentions légales), French and English like the other legal pages. Contact goes through the tickets
// of /support only: no e-mail address is shown. Every fact comes from lib/company.ts or from the terms of sale.
export default async function LegalNotice({ searchParams }: Props) {
  const locale = await localeFromSearch(searchParams);
  const q = `?lang=${locale}`;

  if (locale === 'fr') {
    return (
      <LegalPage locale={locale} title="Mentions légales" updated="Dernière mise à jour : 23 novembre 2026">
        <div className="box">
          <p style={{ margin: 0 }}>
            <strong>En bref :</strong> le site {SITE_DOMAIN} est édité par {company.name}. Pour nous joindre, une seule adresse :{' '}
            <Link href="/support">le centre d’aide</Link>, où chaque demande reçoit un numéro de suivi et une réponse par email. Les certifications
            sont des certificats privés, indépendants des écoles et des éditeurs de logiciels cités sur le site.
          </p>
        </div>

        <h2>1. Éditeur du site</h2>
        <p>
          Le site {SITE_DOMAIN} et les certifications The AI Certification sont édités par <strong>{company.name}</strong>, {company.legalForm}.
        </p>
        <ul>
          {company.siren && <li>SIREN : {company.siren}</li>}
          {company.address && <li>Adresse : {company.address}</li>}
          <li>
            {company.vatExempt
              ? 'TVA non applicable, article 293 B du Code général des impôts.'
              : `Numéro de TVA intracommunautaire : ${company.vatNumber}`}
          </li>
          {company.publisher && <li>Directeur de la publication : {company.publisher}</li>}
        </ul>

        <h2>2. Nous contacter</h2>
        <p>
          Toutes les demandes passent par le centre d’aide : <Link href="/support">ouvrir une demande</Link>. Chaque demande devient un ticket
          avec un numéro de suivi ; nous répondons par email, sous 7 jours ouvrés. Le formulaire est en anglais, mais tu peux nous écrire en
          français.
        </p>
        <p>Tu peux nous écrire au sujet de :</p>
        <ul>
          <li>ton inscription ou ton paiement ;</li>
          <li>l’accès à ton espace (pour un mot de passe perdu, <Link href="/login?reset=1">choisis-en un nouveau ici</Link>) ;</li>
          <li>ton certificat ou sa vérification ;</li>
          <li>une demande de remboursement, dans les cas prévus par la <Link href={`/refund-policy${q}`}>politique de remboursement</Link> ;</li>
          <li>une offre pour une entreprise, une école ou une association ;</li>
          <li>le programme ambassadeurs et ses versements ;</li>
          <li>tes données personnelles, ou le signalement d’un contenu ou d’un abus.</li>
        </ul>

        <h2>3. Hébergement</h2>
        <p>Le site est hébergé par {company.host}.</p>

        <h2>4. Paiements</h2>
        <p>
          Les paiements sont traités par {STRIPE}, Irlande. Les données de carte sont saisies directement chez Stripe et ne transitent jamais
          par nos serveurs. Les prix, les moyens de paiement et les règles de remboursement sont décrits dans les{' '}
          <Link href={`/terms${q}`}>conditions générales de vente</Link> et la <Link href={`/refund-policy${q}`}>politique de remboursement</Link>.
        </p>

        <h2>5. Nature du service et indépendance</h2>
        <p>
          The AI Certification vend des programmes de certification en ligne : des leçons, des exercices, un examen final et, en cas de réussite,
          un certificat numérique. Il s’agit d’un contenu numérique fourni sans support matériel.
        </p>
        <p>
          The AI Certification est <strong>indépendant</strong> des écoles, des universités et des éditeurs de logiciels cités sur le site. Ils ne
          sont pas partenaires et n’ont pas validé les programmes.
        </p>

        <h2>6. Valeur du certificat</h2>
        <p>
          Le certificat est délivré uniquement après la réussite de l’examen final. Il atteste les compétences évaluées par The AI Certification ;
          ce n’est <strong>ni un diplôme d’État ni une certification inscrite au RNCP</strong>.
        </p>
        <p>
          Chaque certificat porte une référence unique. N’importe qui (un recruteur, une école) peut en vérifier l’authenticité sur la{' '}
          <Link href="/verify">page de vérification</Link>. En cas de fraude à l’examen, le certificat peut être annulé, comme le prévoient les
          conditions générales de vente.
        </p>

        <h2>7. Propriété intellectuelle</h2>
        <p>
          L’ensemble du site est protégé par le droit d’auteur : les textes, les leçons, les exercices, les questions d’examen, les illustrations,
          les vidéos, le logo, la mascotte Kai, la charte graphique et le code. Ces éléments appartiennent à l’éditeur ou sont utilisés sous
          licence.
        </p>
        <p>
          Ton accès à un programme est personnel. Sans accord écrit de l’éditeur, il est interdit de reproduire, de diffuser, de revendre ou de
          mettre à disposition de tiers tout ou partie des contenus, de partager ton compte, ou d’extraire les contenus de façon automatisée.
        </p>
        <p>Ton certificat, lui, t’appartient : tu peux l’afficher librement sur ton CV, sur LinkedIn ou ailleurs.</p>

        <h2>8. Marques et produits cités</h2>
        <p>
          Les noms de produits et de sociétés cités sur le site (notamment ceux de Microsoft, Google, LinkedIn, OpenAI et Anthropic) appartiennent
          à leurs propriétaires respectifs. Ils sont cités uniquement pour décrire ce que les programmes enseignent. Cela n’implique aucune
          affiliation, aucun parrainage et aucune validation de leur part.
        </p>

        <h2>9. Écoles et universités citées</h2>
        <p>
          Les noms d’établissements apparaissent sur le site pour permettre à chaque étudiant d’indiquer le sien, et dans le cadre du programme
          ambassadeurs. Leur présence ne signifie pas qu’un partenariat existe avec l’établissement, ni qu’il a validé les programmes. Un
          établissement qui souhaite faire corriger ou retirer une mention peut <Link href="/support">ouvrir une demande</Link>.
        </p>

        <h2>10. Programme ambassadeurs</h2>
        <p>
          Les ambassadeurs sont des partenaires indépendants : ils ne sont ni salariés ni mandataires de The AI Certification. Rejoindre le
          programme est gratuit, rien n’est à acheter, et rien n’est gagné pour le seul fait de recruter quelqu’un : chaque commission provient
          d’un achat réel fait par un étudiant. Le détail figure dans les <Link href="/ambassador-terms">conditions du programme ambassadeurs</Link>.
        </p>

        <h2>11. Responsabilité et disponibilité</h2>
        <p>
          The AI Certification fait ses meilleurs efforts pour que le site soit disponible et que les contenus soient exacts, sans pouvoir
          garantir une absence totale d’interruption ou d’erreur. Les outils d’intelligence artificielle évoluent vite : une leçon peut décrire
          une interface ou une fonction qui a changé depuis.
        </p>
        <p>
          Les contenus ont une vocation pédagogique. Ils ne constituent pas un conseil juridique, financier ou professionnel adapté à ta
          situation. Tes droits d’acheteur, dont la garantie légale de conformité des contenus numériques, sont décrits dans les{' '}
          <Link href={`/terms${q}`}>conditions générales de vente</Link>.
        </p>

        <h2>12. Liens externes</h2>
        <p>
          Le site contient des liens vers des sites tiers (LinkedIn, Stripe, éditeurs d’outils). Nous n’en contrôlons pas le contenu et n’en
          sommes pas responsables. Tu peux faire un lien vers {SITE_DOMAIN} librement, tant que la présentation ne laisse pas croire à un
          partenariat qui n’existe pas.
        </p>

        <h2>13. Données personnelles et cookies</h2>
        <p>
          Les données que nous utilisons, leur durée de conservation, les prestataires qui y ont accès et tes droits (accès, rectification,
          effacement, opposition) sont décrits dans la <Link href={`/privacy${q}`}>politique de confidentialité</Link>. Pour exercer un droit,{' '}
          <Link href="/support">ouvre une demande</Link>.
        </p>

        <h2>14. Signaler un contenu ou un abus</h2>
        <p>
          Pour signaler un contenu que tu estimes illicite, une usurpation d’identité, l’utilisation frauduleuse d’un certificat ou tout autre
          abus, <Link href="/support">ouvre une demande</Link> en indiquant la page concernée et ce que tu as constaté.
        </p>

        <h2>15. Réclamations et droit applicable</h2>
        <p>
          Pour toute réclamation, <Link href="/support">ouvre une demande</Link> : nous répondons sous 7 jours ouvrés. Le site et ces mentions
          sont soumis au droit français, sans te priver de la protection des règles impératives du pays où tu résides. En cas de litige, les
          tribunaux compétents sont ceux prévus par la loi.
        </p>

        <h2>16. Documents liés</h2>
        <ul>
          <li><Link href={`/terms${q}`}>Conditions générales de vente et d’utilisation</Link></li>
          <li><Link href={`/refund-policy${q}`}>Politique de remboursement</Link></li>
          <li><Link href={`/privacy${q}`}>Politique de confidentialité</Link></li>
          <li><Link href="/ambassador-terms">Conditions du programme ambassadeurs</Link></li>
          <li><Link href="/verify">Vérifier un certificat</Link></li>
          <li><Link href="/support">Centre d’aide</Link></li>
        </ul>

        <h2>17. Crédits</h2>
        <p>Site conçu et édité par The AI Certification. Polices Manrope et Caveat, sous licence SIL Open Font.</p>
      </LegalPage>
    );
  }

  return (
    <LegalPage locale={locale} title="Legal notice" updated="Last updated: November 23, 2026">
      <div className="box">
        <p style={{ margin: 0 }}>
          <strong>In short:</strong> {SITE_DOMAIN} is published by {company.name}. There is one way to reach us:{' '}
          <Link href="/support">the help centre</Link>, where every request gets a tracking number and an answer by email. The certifications are
          private certificates, independent from the schools and software publishers named on the site.
        </p>
      </div>

      <h2>1. Publisher</h2>
      <p>
        {SITE_DOMAIN} and The AI Certification certifications are published by <strong>{company.name}</strong>, {company.legalForm}.
      </p>
      <ul>
        {company.siren && <li>SIREN (French business number): {company.siren}</li>}
        {company.address && <li>Address: {company.address}</li>}
        <li>
          {company.vatExempt
            ? 'VAT not applicable, article 293 B of the French General Tax Code (CGI).'
            : `VAT number: ${company.vatNumber}`}
        </li>
        {company.publisher && <li>Publication director: {company.publisher}</li>}
      </ul>

      <h2>2. Contact</h2>
      <p>
        Every request goes through the help centre: <Link href="/support">open a request</Link>. Each one becomes a ticket with a tracking
        number; we answer by email within 7 working days.
      </p>
      <p>You can write to us about:</p>
      <ul>
        <li>your registration or your payment;</li>
        <li>access to your space (for a lost password, <Link href="/login?reset=1">choose a new one here</Link>);</li>
        <li>your certificate or its verification;</li>
        <li>a refund request, in the cases listed in the <Link href={`/refund-policy${q}`}>refund policy</Link>;</li>
        <li>an offer for a company, a school or an association;</li>
        <li>the ambassador programme and its payouts;</li>
        <li>your personal data, or reporting content or abuse.</li>
      </ul>

      <h2>3. Hosting</h2>
      <p>The site is hosted by {company.host}.</p>

      <h2>4. Payments</h2>
      <p>
        Payments are processed by {STRIPE}, Ireland. Card details are entered directly with Stripe and never pass through our servers. Prices,
        payment methods and refund rules are set out in the <Link href={`/terms${q}`}>terms of sale</Link> and the{' '}
        <Link href={`/refund-policy${q}`}>refund policy</Link>.
      </p>

      <h2>5. What we offer, and our independence</h2>
      <p>
        The AI Certification sells online certification programs: lessons, exercises, a final exam and, if you pass, a digital certificate. This
        is digital content supplied without any physical medium.
      </p>
      <p>
        The AI Certification is <strong>independent</strong> from the schools, universities and software publishers named on the site. They are
        not partners and have not approved the programs.
      </p>

      <h2>6. What the certificate is worth</h2>
      <p>
        The certificate is issued only after you pass the final exam. It attests the skills assessed by The AI Certification;{' '}
        <strong>it is not a state diploma or an accredited degree</strong>.
      </p>
      <p>
        Every certificate carries a unique reference. Anyone (a recruiter, a school) can check that it is genuine on the{' '}
        <Link href="/verify">verification page</Link>. In case of fraud at the exam, the certificate may be cancelled, as set out in the terms of
        sale.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        The whole site is protected by copyright: texts, lessons, exercises, exam questions, illustrations, videos, the logo, the mascot Kai, the
        visual identity and the code. These belong to the publisher or are used under licence.
      </p>
      <p>
        Your access to a program is personal. Without the publisher’s written consent, you may not reproduce, distribute, resell or make
        available to others all or part of the content, share your account, or extract the content by automated means.
      </p>
      <p>Your certificate, however, is yours: you are free to show it on your CV, on LinkedIn or anywhere else.</p>

      <h2>8. Trademarks and products named</h2>
      <p>
        The product and company names mentioned on the site (including those of Microsoft, Google, LinkedIn, OpenAI and Anthropic) belong to
        their respective owners. They are named only to describe what the programs teach. This implies no affiliation, sponsorship or approval
        on their part.
      </p>

      <h2>9. Schools and universities named</h2>
      <p>
        Names of institutions appear on the site so that each student can indicate theirs, and as part of the ambassador programme. Their
        presence does not mean that a partnership exists with the institution, or that it has approved the programs. An institution that wants
        a mention corrected or removed can <Link href="/support">open a request</Link>.
      </p>

      <h2>10. Ambassador programme</h2>
      <p>
        Ambassadors are independent partners: they are neither employees nor agents of The AI Certification. Joining is free, nothing has to be
        bought, and nothing is ever earned just for recruiting someone: every commission comes from a real student purchase. The details are in
        the <Link href="/ambassador-terms">ambassador programme terms</Link>.
      </p>

      <h2>11. Liability and availability</h2>
      <p>
        The AI Certification does its best to keep the site available and the content accurate, but cannot guarantee that there will never be an
        interruption or an error. AI tools change fast: a lesson may describe a screen or a feature that has changed since.
      </p>
      <p>
        The content is educational. It is not legal, financial or professional advice suited to your situation. Your rights as a buyer,
        including the legal guarantee of conformity for digital content, are set out in the <Link href={`/terms${q}`}>terms of sale</Link>.
      </p>

      <h2>12. External links</h2>
      <p>
        The site links to third-party sites (LinkedIn, Stripe, tool publishers). We do not control their content and are not responsible for
        it. You are free to link to {SITE_DOMAIN}, as long as the presentation does not suggest a partnership that does not exist.
      </p>

      <h2>13. Personal data and cookies</h2>
      <p>
        The data we use, how long we keep it, the providers who can see it and your rights (access, correction, deletion, objection) are
        described in the <Link href={`/privacy${q}`}>privacy policy</Link>. To exercise a right, <Link href="/support">open a request</Link>.
      </p>

      <h2>14. Reporting content or abuse</h2>
      <p>
        To report content you believe is unlawful, an impersonation, the fraudulent use of a certificate or any other abuse,{' '}
        <Link href="/support">open a request</Link> and tell us which page is concerned and what you saw.
      </p>

      <h2>15. Complaints and governing law</h2>
      <p>
        For any complaint, <Link href="/support">open a request</Link>: we answer within 7 working days. The site and this notice are governed
        by French law, without depriving you of the mandatory protections of the country where you live. Disputes go to the courts designated
        by law.
      </p>

      <h2>16. Related documents</h2>
      <ul>
        <li><Link href={`/terms${q}`}>Terms of sale and use</Link></li>
        <li><Link href={`/refund-policy${q}`}>Refund policy</Link></li>
        <li><Link href={`/privacy${q}`}>Privacy policy</Link></li>
        <li><Link href="/ambassador-terms">Ambassador programme terms</Link></li>
        <li><Link href="/verify">Verify a certificate</Link></li>
        <li><Link href="/support">Help centre</Link></li>
      </ul>

      <h2>17. Credits</h2>
      <p>Site designed and published by The AI Certification. Manrope and Caveat typefaces, under the SIL Open Font License.</p>
    </LegalPage>
  );
}
