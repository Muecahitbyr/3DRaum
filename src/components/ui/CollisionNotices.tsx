import type { CollisionMessage } from '../../collision';
import styles from './CollisionNotices.module.css';

/** Kollisions- und Hinweistexte für das ausgewählte Objekt (live aktualisiert). */
export function CollisionNotices({ messages }: { messages: readonly CollisionMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <div className={styles.list}>
      {messages.map((message) => (
        <p
          key={message.rule + message.text}
          className={`${styles.notice} ${styles[message.severity]}`}
          role="status"
          data-testid="collision-notice"
          data-severity={message.severity}
          data-rule={message.rule}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M8 1.8 15 14H1z" strokeLinejoin="round" />
            <path d="M8 6.5v3.2M8 11.6v.4" strokeLinecap="round" />
          </svg>
          {message.text}
        </p>
      ))}
    </div>
  );
}
