'use client';

import { ticketStatusAction } from '@/lib/privateActions';

// Statut d'un ticket depuis l'admin (21/11) : un choix l'enregistre aussitôt, dans la liste comme dans la fiche.
const OPTIONS: [string, string][] = [['open', 'To handle'], ['answered', 'Answered'], ['closed', 'Closed']];

export default function TicketStatusSelect({ id, status, back }: { id: string; status: string; back: string }) {
  return (
    <form action={ticketStatusAction} className="tk-status-form">
      <input type="hidden" name="ticket_id" value={id} />
      <input type="hidden" name="back" value={back} />
      <select name="status" defaultValue={status} aria-label="Ticket status" className={`tk-status tk-${status}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </form>
  );
}
