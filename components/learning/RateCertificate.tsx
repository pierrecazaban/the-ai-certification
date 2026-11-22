import { rateCertificateAction } from '@/lib/learnActions';
import type { LearnDict } from '@/lib/i18n/learn';

// Asked before the "add to LinkedIn" block: a 1-5 star rating (required) and a comment (may stay empty).
// The stars are radio buttons: listed 5 → 1 and shown reversed, so CSS can light up a star and those before it.
export default function RateCertificate({ program, l, missing }: { program: string; l: LearnDict; missing: boolean }) {
  return (
    <form action={rateCertificateAction} className="form rate-form">
      <input type="hidden" name="program" value={program} />
      <fieldset className="rate-fieldset">
        <legend>{l.rateQuestion}</legend>
        <div className="rate-stars">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} title={l.rateStar(n)}>
              <input type="radio" name="rating" value={n} required />
              <span className="rate-star" aria-hidden="true">★</span>
              <span className="rate-label">{l.rateStar(n)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {missing && <p className="error" role="alert">{l.rateMissing}</p>}
      <div className="field">
        <label htmlFor="rate-comment">{l.rateComment}</label>
        <textarea id="rate-comment" name="comment" rows={3} maxLength={2000} placeholder={l.rateCommentPlaceholder} />
      </div>
      <div><button className="btn btn-green" type="submit">{l.rateSubmit}</button></div>
    </form>
  );
}
