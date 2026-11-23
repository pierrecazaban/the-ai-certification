import LessonBody from './LessonBody';
import LessonFigure from './LessonFigure';
import { lessonPhoto, type Lesson } from '@/lib/learning';
import { lessonStory, lessonWidgets } from '@/lib/learning/figures';

/** A lesson's content. v1: the CC0 photo on top (public/images/course/CREDITS.md), then the text. v2: the text with
 *  its animated widgets step by step, then the whole story as a recap tab (see lib/learning/figures). */
export default function LessonContent({ lesson, locale }: { lesson: Lesson; locale?: string }) {
  const story = lessonStory(lesson.id, locale);
  const photo = story ? null : lessonPhoto(lesson);
  const figures = Object.fromEntries(lessonWidgets(lesson.id, locale).map((w) => [w.after, <LessonFigure key={w.media.video} media={w.media} locale={locale} />]));
  return (
    <>
      {photo && <img className="learn-photo" src={photo} alt="" width={960} height={640} loading="lazy" />}
      <LessonBody body={lesson.body} figures={figures} />
      {story && (
        <div className="lf-recap" style={{ '--ar': `${story.w / story.h}` } as React.CSSProperties}>
          <span className="lf-tab">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5Q13.6 10.4 22.5 12Q13.6 13.6 12 22.5Q10.4 13.6 1.5 12Q10.4 10.4 12 1.5Z" fill="currentColor" /></svg>
            {locale === 'fr' ? 'Récapitulatif' : 'Recap'}
          </span>
          <LessonFigure media={story} locale={locale} fill />
        </div>
      )}
    </>
  );
}
