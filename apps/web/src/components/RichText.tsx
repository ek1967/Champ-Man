import { parseRichText } from '@moc/engine';
import { EntityLink } from './EntityLink.tsx';

/** Renders news text: blank lines split paragraphs, [[type:id|label]] become links. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="rich-text">
      {text.split('\n\n').map((paragraph, i) => (
        <p key={i}>
          {paragraph.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {parseRichText(line).map((part, k) =>
                'text' in part ? (
                  <span key={k}>{part.text}</span>
                ) : (
                  <EntityLink key={k} type={part.type} id={part.id}>
                    {part.label}
                  </EntityLink>
                ),
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
