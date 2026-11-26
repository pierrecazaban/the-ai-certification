import { sql } from '@/lib/db';
import { getConfig } from '@/lib/outreach';
import AmbProspection from '@/components/private/AmbProspection';

// Vue ambassadeur de l'admin (26/11, « je dois voir ce qu'ils voient ») : la carte « Prospect with your LinkedIn » telle
// qu'un ambassadeur la voit, en aperçu (boutons inactifs). Par défaut celle d'un ambassadeur qui n'a pas encore relié son
// LinkedIn ; un lien par ambassadeur relié montre la sienne (ses chiffres, ses contacts, qui lui a répondu).
const NOBODY = '00000000-0000-0000-0000-000000000000';

export default async function AmbProspectionPreview({ voir }: { voir?: string }) {
  const [accounts, config] = await Promise.all([
    sql(`select a.user_id::text as user_id, a.name, a.status, u.email from prospect_accounts a join users u on u.id = a.user_id
          where a.id like 'amb-%' and a.status <> 'stopped' order by a.created_at`),
    getConfig(),
  ]);
  const chosen = accounts.find((a) => a.user_id === voir);
  const label = (a: (typeof accounts)[number]) => String(a.name || a.email || 'Ambassadeur');
  return (
    <>
      <div className="cx-card" lang="fr" style={{ borderStyle: 'dashed' }}>
        <p className="help" style={{ margin: 0 }}>
          Aperçu : la carte LinkedIn telle qu’un ambassadeur la voit en haut de son espace,{' '}
          {chosen ? <>ici celle de <strong>{label(chosen)}</strong></> : 'ici celle d’un ambassadeur qui n’a pas encore relié son LinkedIn'}.
          Les boutons sont inactifs dans l’aperçu. Tant que leur LinkedIn ne prospecte pas, les ambassadeurs voient d’abord une page plein écran à chaque arrivée :{' '}
          <a href={`?apercu=page${chosen ? `&voir=${encodeURIComponent(String(chosen.user_id))}` : ''}`}>voir cette page</a>.
          {config.ambEnabled === false && <> La prospection des ambassadeurs est éteinte : ils ne voient pas cette carte en ce moment.</>}
        </p>
        {accounts.length > 0 && (
          <p className="help" style={{ margin: '8px 0 0' }}>
            Voir celle de :{' '}
            {accounts.map((a, i) => (
              <span key={String(a.user_id)}>{i > 0 && ' · '}<a href={`?ensuite=1&voir=${encodeURIComponent(String(a.user_id))}#linkedin`}>{label(a)}</a></span>
            ))}
            {' · '}<a href="?ensuite=1#linkedin">un nouvel ambassadeur</a>
          </p>
        )}
      </div>
      <AmbProspection userId={chosen ? String(chosen.user_id) : NOBODY} preview />
    </>
  );
}
