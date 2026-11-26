'use client';

import { useState } from 'react';
import { ambassadorAnswerAction } from '@/lib/learnActions';
import { LEAD_HANDLE_MAX, LEAD_HANDLE_MIN, LEAD_NETWORKS, LEAD_SCHOOLS_MAX } from '@/lib/leadNetworks';

type Texts = {
  title: string; pitch: string; offer: string; yes: string; no: string; network: string; handle: string;
  handlePlaceholder: string; schools: string; submit: string; missing: string; note: string;
};

// Dernière étape avant le certificat (24/11) : « Tu veux devenir ambassadeur ? ». Non → le certificat. Oui → le réseau
// social et le pseudo où Pierre peut joindre l'élève, puis le certificat. Posée une seule fois par élève.
export default function AmbassadorAsk({ t, program, missing }: { t: Texts; program: string; missing: boolean }) {
  const [open, setOpen] = useState(missing);
  const no = (
    <form action={ambassadorAnswerAction}>
      <input type="hidden" name="program" value={program} />
      <input type="hidden" name="answer" value="no" />
      <button className="amb-no" type="submit">{t.no}</button>
    </form>
  );
  return (
    <div className="amb-card">
      <img className="amb-kai" src="/assets/kai-avatar.png" alt="" width={92} height={92} />
      <h2>{t.title}</h2>
      <p className="amb-pitch">{t.pitch}</p>
      <p className="amb-offer">{t.offer}</p>
      {!open ? (
        <div className="amb-choice">
          <button className="amb-yes" type="button" onClick={() => setOpen(true)}>{t.yes}</button>
          {no}
        </div>
      ) : (
        <>
          <form action={ambassadorAnswerAction} className="amb-form">
            <input type="hidden" name="program" value={program} />
            <input type="hidden" name="answer" value="yes" />
            <fieldset className="amb-networks">
              <legend>{t.network}</legend>
              <div className="amb-pills">
                {LEAD_NETWORKS.map((n, i) => (
                  <label key={n.id}>
                    <input type="radio" name="network" value={n.id} defaultChecked={i === 0} required />
                    <span>{n.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="amb-field">
              <label htmlFor="amb-handle">{t.handle}</label>
              <input id="amb-handle" name="handle" type="text" required minLength={LEAD_HANDLE_MIN} maxLength={LEAD_HANDLE_MAX}
                placeholder={t.handlePlaceholder} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
            </div>
            <div className="amb-field">
              <label htmlFor="amb-schools">{t.schools}</label>
              <input id="amb-schools" name="schools" type="text" maxLength={LEAD_SCHOOLS_MAX} autoComplete="off" />
            </div>
            {missing && <p className="amb-error" role="alert">{t.missing}</p>}
            <button className="amb-yes" type="submit">{t.submit}</button>
            <p className="amb-note">{t.note}</p>
          </form>
          {no}
        </>
      )}
    </div>
  );
}
