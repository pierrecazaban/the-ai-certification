import { GRADE_LABEL, type Grade } from '@/lib/grades';

// Grade badges (19/11), drawn the same in the page and inside the pyramid. Icons sit in a 26 × 22 box centred on
// (13, 11): a grey paw for the Dog, one chevron for Intermediate, two for Advanced, the logo star for Master.
export function GradeIcon({ grade }: { grade: Grade }) {
  if (grade === 'dog') {
    return (
      <g className="gi gi-dog">
        <ellipse cx={13} cy={13.6} rx={3.3} ry={2.7} />
        <circle cx={9.4} cy={9.9} r={1.25} />
        <circle cx={11.7} cy={8.1} r={1.25} />
        <circle cx={14.3} cy={8.1} r={1.25} />
        <circle cx={16.6} cy={9.9} r={1.25} />
      </g>
    );
  }
  if (grade === 'intermediate') return <path className="gi gi-line" d="M8.5 13.6 L13 9.1 L17.5 13.6" />;
  if (grade === 'advanced') return <path className="gi gi-line" d="M8.5 11.2 L13 6.7 L17.5 11.2 M8.5 15.6 L13 11.1 L17.5 15.6" />;
  return <path className="gi gi-star" d="M13 4 Q14.1 9.9 20 11 Q14.1 12.1 13 18 Q11.9 12.1 6 11 Q11.9 9.9 13 4Z" />;
}

/** The badge in the page. */
export default function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span className={`gb gb-${grade}`}>
      <svg viewBox="5 3 16 16" width="15" height="15" aria-hidden="true"><GradeIcon grade={grade} /></svg>
      {GRADE_LABEL[grade]}
    </span>
  );
}
