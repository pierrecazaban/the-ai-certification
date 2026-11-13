'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

type Day = { date: string; label: string; times: { iso: string; label: string }[] };

function Submit({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={!ready || pending}>
      {pending ? 'Réservation…' : 'Réserver mon appel'}
    </button>
  );
}

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Month grid (Monday first). Days with free slots can be picked; the others are greyed out. */
function Calendar({ days, selected, onPick }: { days: Day[]; selected: string; onPick: (date: string) => void }) {
  const open = new Map(days.map((d) => [d.date, d.times.length]));
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))];
  const [index, setIndex] = useState(Math.max(0, months.indexOf(selected.slice(0, 7))));
  const month = months[index] ?? months[0];
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // blanks before the 1st (week starts on Monday)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const title = MONTH.format(first);

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label="Mois précédent">‹</button>
        <strong>{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
        <button type="button" className="cal-nav" onClick={() => setIndex(index + 1)} disabled={index >= months.length - 1} aria-label="Mois suivant">›</button>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((w) => <span key={w} className="cal-wd">{w}</span>)}
        {cells.map((c, i) =>
          c ? (
            <button
              key={c}
              type="button"
              className={`cal-day${c === selected ? ' is-on' : ''}`}
              disabled={!open.has(c)}
              onClick={() => onPick(c)}
              aria-pressed={c === selected}
              title={open.has(c) ? `${open.get(c)} créneau${open.get(c)! > 1 ? 'x' : ''}` : 'Indisponible'}
            >
              {Number(c.slice(8))}
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

// Day, then time, then name and email. Times are shown in Paris time, as the slots are computed there.
type Prospect = { token: string; first_name: string; last_name: string; school: string } | null;

export default function CallPicker({ days, linkedin, prospect, action }: { days: Day[]; linkedin: string; prospect: Prospect; action: (fd: FormData) => Promise<void> }) {
  const [date, setDate] = useState(days[0]?.date ?? '');
  const [slot, setSlot] = useState('');
  const day = days.find((d) => d.date === date);

  return (
    <form className="form" action={action}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 8, padding: 0 }}>1. Choisis un jour</legend>
        <Calendar days={days} selected={date} onPick={(d) => { setDate(d); setSlot(''); }} />
      </fieldset>

      {day && (
        <fieldset className="field topic-chips">
          <legend>2. Choisis une heure le {day.label} (heure de Paris)</legend>
          <div>
            {day.times.map((t) => (
              <label key={t.iso} className={t.iso === slot ? 'is-on' : undefined}>
                <input type="radio" name="slot" value={t.iso} checked={t.iso === slot} onChange={() => setSlot(t.iso)} required />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="form-row">
        <div className="field">
          <label htmlFor="c-first">Prénom</label>
          <input id="c-first" name="first_name" autoComplete="given-name" required maxLength={80} defaultValue={prospect?.first_name} />
        </div>
        <div className="field">
          <label htmlFor="c-last">Nom</label>
          <input id="c-last" name="last_name" autoComplete="family-name" maxLength={80} defaultValue={prospect?.last_name} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input id="c-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="c-school">École</label>
          <input id="c-school" name="school" placeholder="HEC Paris, Université de Lille…" maxLength={120} defaultValue={prospect?.school} />
        </div>
      </div>
      <input type="hidden" name="linkedin" value={linkedin} />
      {prospect && <input type="hidden" name="prospect" value={prospect.token} />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
      <Submit ready={!!slot} />
    </form>
  );
}
