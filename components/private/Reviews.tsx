import { sql } from '@/lib/db';
import { programBySlug } from '@/lib/catalog';

// Onglet « Avis » de l'admin (23/11) : la note sur 5 et le commentaire que chaque élève laisse après son certificat
// (certificates.rating, rating_comment, rated_at), du plus récent au plus ancien, avec la moyenne et la répartition.
const dt = (v: string | Date) => new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

function Stars({ n }: { n: number }) {
  return (
    <span className="rv-stars" role="img" aria-label={`${n} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''} aria-hidden="true">★</span>)}
    </span>
  );
}

export default async function Reviews({ stars }: { stars: string }) {
  const only = /^[1-5]$/.test(stars) ? Number(stars) : 0;
  const rows = await sql(
    `select c.reference, c.holder_name, c.program, c.rating, c.rating_comment, c.rated_at, c.tp_shown_at, c.tp_clicked_at, c.tp_clicks, u.email,
       (select coalesce(nullif(un.short_name, ''), un.name) from registrations r join universities un on un.id = r.university_id where r.user_id = c.user_id order by r.created_at desc limit 1) as school
     from certificates c join users u on u.id = c.user_id
     where c.rating is not null order by c.rated_at desc nulls last limit 1000`,
  );
  const [counts] = await sql('select count(*)::int as certs, count(rating)::int as rated from certificates');
  const total = rows.length;
  const avg = total ? rows.reduce((s, r) => s + Number(r.rating), 0) / total : 0;
  const per = [5, 4, 3, 2, 1].map((n) => ({ n, count: rows.filter((r) => Number(r.rating) === n).length }));
  const shown = only ? rows.filter((r) => Number(r.rating) === only) : rows;
  // Écran Trustpilot (5 étoiles seulement), compté depuis le 23/11 : qui l'a vu, qui a cliqué sur le bouton.
  const five = rows.filter((r) => Number(r.rating) === 5);
  const tpSeen = five.filter((r) => r.tp_shown_at).length;
  const tpClicked = five.filter((r) => r.tp_clicked_at).length;
  const href = (n: number) => `/admin?tab=avis${n ? `&stars=${n}` : ''}`;

  return (
    <section className="cx-card">
      <div className="cx-toolbar">
        <h2>Avis <small>({total})</small></h2>
      </div>
      <div className="rv-summary">
        <div className="rv-avg">
          <strong>{total ? avg.toFixed(1).replace('.', ',') : '—'}</strong>
          <Stars n={Math.round(avg)} />
          <small>{total} avis · {counts.certs} certificat{counts.certs === 1 ? '' : 's'} délivré{counts.certs === 1 ? '' : 's'}</small>
        </div>
        <div className="rv-bars">
          {per.map((p) => (
            <a key={p.n} href={href(only === p.n ? 0 : p.n)} className={only === p.n ? 'on' : ''} aria-label={`${p.count} avis à ${p.n} étoiles`}>
              <span>{p.n} ★</span>
              <i><b style={{ width: `${total ? Math.round((p.count / total) * 100) : 0}%` }} /></i>
              <em>{p.count}</em>
            </a>
          ))}
        </div>
      </div>
      <p className="help" title="L’écran Trustpilot ne s’affiche qu’après une note de 5 étoiles. Compté depuis le 23/11. Un clic veut dire que l’élève a ouvert Trustpilot, pas qu’il y a déposé son avis.">
        Écran Trustpilot (5 étoiles seulement) : {five.length} note{five.length > 1 ? 's' : ''} à 5 étoiles · vu par {tpSeen} · {tpClicked} {tpClicked > 1 ? 'ont' : 'a'} cliqué sur le bouton{tpSeen ? ` (${Math.round((tpClicked / tpSeen) * 100)} %)` : ''}
      </p>
      {only > 0 && <p className="help"><a href={href(0)}>← Tous les avis</a> · seulement les {only} étoiles</p>}
      <ul className="rv-list">
        {shown.map((r) => (
          <li key={r.reference}>
            <div className="rv-top">
              <Stars n={Number(r.rating)} />
              <small>{r.rated_at ? dt(r.rated_at) : ''}</small>
            </div>
            {r.rating_comment ? <p>{r.rating_comment}</p> : <p className="rv-none">Pas de commentaire.</p>}
            <small className="rv-who">{r.holder_name} · {r.email}{r.school ? ` · ${r.school}` : ''}{programBySlug(r.program)?.title ? ` · ${programBySlug(r.program)!.title}` : ''}{Number(r.rating) === 5 ? ` · Trustpilot : ${r.tp_clicked_at ? `a cliqué${Number(r.tp_clicks) > 1 ? ` (${r.tp_clicks} fois)` : ''}` : r.tp_shown_at ? 'écran vu, pas de clic' : 'écran pas encore vu'}` : ''}</small>
          </li>
        ))}
        {shown.length === 0 && <li className="rv-none">Aucun avis pour l’instant.</li>}
      </ul>
    </section>
  );
}
