'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

// /admin › Réglages (28/11) : relit les données de la page sans la recharger ni refermer les sections ouvertes.
export default function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? 'Mise à jour…' : '↻ Rafraîchir'}
    </button>
  );
}
