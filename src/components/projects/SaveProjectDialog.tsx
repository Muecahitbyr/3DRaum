import { useState, type FormEvent } from 'react';
import { PROJECT_NAME_MAX_LENGTH } from '../../projects/format';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextField } from '../ui/TextField';

interface SaveProjectDialogProps {
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
  /** „Speichern unter“: eigener Titel und Hinweis (Original bleibt unverändert). */
  saveAs?: boolean;
}

/** Namen vergeben beim ersten Speichern bzw. beim Speichern unter neuem Namen. */
export function SaveProjectDialog({ initialName, onSave, onClose, saveAs = false }: SaveProjectDialogProps) {
  const [name, setName] = useState(initialName);
  const valid = name.trim().length > 0;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (valid) onSave(name);
  };

  return (
    <Dialog
      title={saveAs ? 'Speichern unter' : 'Projekt speichern'}
      onClose={onClose}
      width={400}
      testId="save-project-dialog"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={() => submit()} disabled={!valid} data-testid="save-project-submit">
            Speichern
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <TextField label="Projektname" value={name} maxLength={PROJECT_NAME_MAX_LENGTH} onChange={setName} placeholder="z. B. Wohnzimmer" />
        {saveAs && (
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontSize: 12 }}>
            Der aktuelle Stand wird als neues Projekt gespeichert; das bisherige Projekt bleibt unverändert.
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
