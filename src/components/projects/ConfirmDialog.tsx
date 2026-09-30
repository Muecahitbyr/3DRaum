import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  return (
    <Dialog
      title={request.title}
      onClose={onClose}
      width={420}
      testId="confirm-dialog"
      footer={
        <>
          <Button onClick={onClose} data-testid="confirm-cancel">
            Abbrechen
          </Button>
          <Button
            variant={request.danger ? 'danger' : 'primary'}
            onClick={() => {
              onClose();
              request.onConfirm();
            }}
            data-autofocus
            data-testid="confirm-accept"
          >
            {request.confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{request.message}</p>
    </Dialog>
  );
}
