import { useState, type FormEvent } from 'react';
import { PROJECT_NAME_MAX_LENGTH } from '../../projects/format';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextField } from '../ui/TextField';

interface SaveProjectDialogProps {
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

/** Namen vergeben beim ersten Speichern eines neuen Projekts. */
export function SaveProjectDialog({ initialName, onSave, onClose }: SaveProjectDialogProps) {
  const [name, setName] = useState(initialName);
  const valid = name.trim().length > 0;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (valid) onSave(name);
  };

  return (
    <Dialog
      title="Projekt speichern"
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
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
