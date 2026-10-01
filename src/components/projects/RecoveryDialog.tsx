import type { RecoveryOffer } from '../../hooks/useProjectSession';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

interface RecoveryDialogProps {
  offer: RecoveryOffer;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Beim Start: nicht gespeicherte Änderungen (Autosave-Entwurf) wiederherstellen oder verwerfen.
 * Bewusste Entscheidung – kein Schließen per Esc oder Klick daneben.
 */
export function RecoveryDialog({ offer, onRestore, onDiscard }: RecoveryDialogProps) {
  return (
    <Dialog
      title="Nicht gespeicherte Änderungen wiederherstellen?"
      onClose={() => {}}
      dismissible={false}
      width={440}
      testId="recovery-dialog"
      footer={
        <>
          <Button onClick={onDiscard} data-testid="recovery-discard">
            Verwerfen
          </Button>
          <Button variant="primary" onClick={onRestore} data-autofocus data-testid="recovery-restore">
            Wiederherstellen
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 8px' }}>
        Für <strong data-testid="recovery-name">„{offer.name}“</strong> gibt es Änderungen, die nicht gespeichert wurden – etwa
        weil der Browser geschlossen wurde oder abgestürzt ist.
      </p>
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }} data-testid="recovery-time">
        Automatisch gesichert am {dateFormat.format(new Date(offer.savedAt))}.
      </p>
    </Dialog>
  );
}
