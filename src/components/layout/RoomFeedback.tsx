import { useEffect, useState } from 'react';
import styles from './RoomFeedback.module.css';

const DURATION_MS = 4000;

/** Kurze, verständliche Rückmeldung, wenn eine Grundriss-Änderung abgelehnt wurde. */
export function RoomFeedback({ feedback }: { feedback: { message: string; id: number } | null }) {
  const [visible, setVisible] = useState<{ message: string; id: number } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    setVisible(feedback);
    const timer = setTimeout(() => setVisible((current) => (current?.id === feedback.id ? null : current)), DURATION_MS);
    return () => clearTimeout(timer);
  }, [feedback]);
  if (!visible) return null;
  return (
    <div className={styles.feedback} role="alert" data-testid="room-feedback">
      <strong>Änderung nicht übernommen:</strong> {visible.message}
    </div>
  );
}
