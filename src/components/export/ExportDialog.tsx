import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import styles from './ExportDialog.module.css';

export type ExportKind = 'plan-png' | '3d-png' | 'pdf' | 'project';

interface ExportDialogProps {
  /** Führt den Export aus und liefert den Dateinamen; wirft bei Fehlern. */
  onExport: (kind: ExportKind) => Promise<string>;
  /** Ohne WebGL gibt es keine 3D-Bilder. */
  canRender3d: boolean;
  onClose: () => void;
}

const OPTIONS: readonly { kind: ExportKind; title: string; text: string; needs3d?: boolean }[] = [
  { kind: 'plan-png', title: 'Grundriss als Bild (PNG)', text: 'Hochauflösend auf weißem Grund – mit Wandmaßen, Türen, Fenstern, Heizkörpern und beschrifteten Möbeln.' },
  { kind: '3d-png', title: '3D-Ansicht als Bild (PNG)', text: 'Realistische Vorschau ohne Bedienelemente. Ist die Vorschau offen, wird genau diese Ansicht verwendet.', needs3d: true },
  { kind: 'pdf', title: 'Planungsbericht (PDF)', text: 'Projektname, Datum, Grundriss, 3D-Vorschau, Raumdaten und Möbelübersicht mit Maßen.' },
  { kind: 'project', title: 'Projektdatei (.3draum)', text: 'Der vollständige Plan zum Sichern oder Übertragen auf ein anderes Gerät (über „Projekte“ → „Projektdatei importieren“).' },
];

/** Export: Bilder, PDF-Bericht und Projektdatei – mit Fortschritt und verständlichen Fehlern. */
export function ExportDialog({ onExport, canRender3d, onClose }: ExportDialogProps) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const run = async (kind: ExportKind) => {
    setBusy(kind);
    setMessage(null);
    try {
      const fileName = await onExport(kind);
      setMessage({ kind: 'success', text: `„${fileName}“ wurde heruntergeladen.` });
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : 'Unbekannter Fehler.';
      setMessage({ kind: 'error', text: `Export fehlgeschlagen: ${reason}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog title="Export" onClose={onClose} width={520} testId="export-dialog">
      <div className={styles.options}>
        {OPTIONS.map((option, i) => {
          const disabled = busy !== null || (option.needs3d && !canRender3d);
          return (
            <button
              key={option.kind}
              type="button"
              className={styles.option}
              onClick={() => void run(option.kind)}
              disabled={disabled}
              aria-busy={busy === option.kind}
              data-testid={`export-${option.kind}`}
              data-autofocus={i === 0 ? true : undefined}
            >
              <span className={styles.title}>{busy === option.kind ? 'Wird erstellt …' : option.title}</span>
              <span className={styles.text}>
                {option.needs3d && !canRender3d ? '3D-Darstellung ist auf diesem Gerät nicht verfügbar.' : option.text}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.message} role={message?.kind === 'error' ? 'alert' : 'status'} data-kind={message?.kind} data-testid="export-message">
        {message?.text}
      </p>
    </Dialog>
  );
}
