'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent as ReactChange, KeyboardEvent as ReactKey, PointerEvent as ReactPointer } from 'react';
import './LinkedInLive.css';

// Connexion LinkedIn en direct (26/11) : la vraie page de connexion de LinkedIn, ouverte sur le serveur des ambassadeurs
// (prospection.2-25-7-244.sslip.io), s'affiche ici en direct. On touche et on tape comme sur linkedin.com : un clic est
// envoyé à la page, et un vrai champ est posé exactement sur le champ actif de la page (clavier du téléphone, codes à
// chiffres, gestionnaire de mots de passe de l'appareil). Le mot de passe ne passe que vers LinkedIn, jamais vers le site.

export type LinkedInLiveTexts = {
  opening: string; // « Ouverture de LinkedIn… »
  hint: string; // une ligne au-dessus de l'écran pendant la connexion
  connected: string; // « Ton LinkedIn est connecté{nom}. » ({nom} devient « (Prénom Nom) » ou rien)
  failed: string; // message d'échec quand le serveur n'en donne pas
  closed: string; // « La connexion est fermée. »
  network: string; // « La connexion au serveur a été coupée. »
  retry: string; // « Réessayer »
  cancel: string; // « Annuler »
  screen: string; // nom de l'écran pour les lecteurs d'écran : « Page de connexion LinkedIn »
};

type Champ = { type: string; auto: string; id: string; x: number; y: number; l: number; h: number; fs: number; pg: number; valeur: string };
type Etat = 'ouverture' | 'ouvert' | 'connecte' | 'echec' | 'ferme' | 'coupure';
type Message =
  | { t: 'image'; d: string; w: number; h: number }
  | { t: 'etat'; etat: 'ouvert' | 'connecte' | 'echec' | 'ferme'; message?: string; nom?: string }
  | { t: 'clavier'; champ: Champ | null };

const borne = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function lire(brut: unknown): Message | null {
  if (typeof brut !== 'string') return null;
  let m: unknown;
  try { m = JSON.parse(brut); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.t === 'image' && typeof o.d === 'string' && typeof o.w === 'number' && typeof o.h === 'number') return { t: 'image', d: o.d, w: o.w, h: o.h };
  if (o.t === 'etat' && (o.etat === 'ouvert' || o.etat === 'connecte' || o.etat === 'echec' || o.etat === 'ferme')) {
    return { t: 'etat', etat: o.etat, message: typeof o.message === 'string' ? o.message : undefined, nom: typeof o.nom === 'string' ? o.nom : undefined };
  }
  if (o.t === 'clavier') {
    const c = o.champ as Record<string, unknown> | null;
    if (c === null) return { t: 'clavier', champ: null };
    if (c && typeof c === 'object' && typeof c.id === 'string' && ['x', 'y', 'l', 'h', 'fs', 'pg'].every((k) => typeof c[k] === 'number')) {
      return { t: 'clavier', champ: { type: String(c.type ?? 'text'), auto: String(c.auto ?? ''), id: c.id, x: c.x as number, y: c.y as number, l: c.l as number, h: c.h as number, fs: c.fs as number, pg: c.pg as number, valeur: String(c.valeur ?? '') } };
    }
  }
  return null;
}

/** Type, clavier et remplissage automatique du champ posé par-dessus, d'après le champ de la page. */
function attributs(c: Champ): { type: string; inputMode?: 'numeric' | 'email' | 'tel' | 'text'; autoComplete: string } {
  if (c.type === 'password') return { type: 'password', autoComplete: 'current-password' };
  if (c.auto.includes('one-time-code') || c.type === 'number') return { type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code' };
  if (c.type === 'email' || c.auto.includes('username') || c.auto.includes('email')) return { type: 'email', inputMode: 'email', autoComplete: 'username' };
  if (c.type === 'tel') return { type: 'tel', inputMode: 'tel', autoComplete: 'tel' };
  return { type: 'text', inputMode: 'text', autoComplete: 'off' };
}

export default function LinkedInLive({ wsUrl, token, texts, onConnected, onRetry }: {
  wsUrl: string;
  token: string;
  texts: LinkedInLiveTexts;
  onConnected?: (nom: string) => void;
  onRetry?: () => void;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const ecran = useRef<HTMLImageElement>(null);
  const champRef = useRef<HTMLInputElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const fin = useRef(false); // un état final est arrivé du serveur : pas de reconnexion
  const reprises = useRef(0);
  const enAttente = useRef<{ s: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const glisse = useRef<{ id: number; x: number; y: number; dernierY: number; defile: boolean } | null>(null);
  const defileCumul = useRef(0);
  const defileImage = useRef<number | null>(null);
  const surConnexion = useRef(onConnected);
  surConnexion.current = onConnected;

  const [etat, setEtat] = useState<Etat>('ouverture');
  const [message, setMessage] = useState('');
  const [nom, setNom] = useState('');
  const [page, setPage] = useState<{ w: number; h: number } | null>(null);
  const [champ, setChamp] = useState<Champ | null>(null);
  const [echelle, setEchelle] = useState(1);
  const [image, setImage] = useState(false);

  const envoyerBrut = useCallback((m: Record<string, unknown>) => {
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);
  // Ce qui a été tapé part avant tout autre geste : sinon un clic ailleurs recevrait le texte du champ précédent.
  const vider = useCallback(() => {
    const p = enAttente.current;
    if (!p) return;
    clearTimeout(p.minuterie);
    enAttente.current = null;
    envoyerBrut({ t: 'remplir', s: p.s });
  }, [envoyerBrut]);
  const envoyer = useCallback((m: Record<string, unknown>) => { vider(); envoyerBrut(m); }, [vider, envoyerBrut]);

  // Connexion au serveur, une reprise automatique si le réseau coupe (même jeton : le serveur reprend la même page).
  useEffect(() => {
    fin.current = false;
    reprises.current = 0;
    let arrete = false;
    let minuterieReprise: ReturnType<typeof setTimeout> | null = null;
    const largeur = Math.round(borne(cadre.current?.clientWidth || 800, 320, 1280));
    const hauteur = Math.round(borne(window.innerHeight * 0.72, 480, 900));
    const dpr = Math.round(borne(window.devicePixelRatio || 1, 1, 3) * 4) / 4;
    const url = `${wsUrl}?t=${encodeURIComponent(token)}&w=${largeur}&h=${hauteur}&dpr=${dpr}`;

    const ouvrir = () => {
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onmessage = (ev) => {
        const m = lire(ev.data);
        if (!m) return;
        if (m.t === 'image') {
          if (ecran.current) ecran.current.src = `data:image/jpeg;base64,${m.d}`;
          setImage(true);
          setPage((p) => (p && p.w === m.w && p.h === m.h ? p : { w: m.w, h: m.h }));
        } else if (m.t === 'clavier') {
          setChamp((c) => {
            if (c && m.champ && c.id === m.champ.id) return { ...m.champ, valeur: c.valeur }; // même champ : il ne fait que bouger
            return m.champ;
          });
        } else if (m.etat === 'ouvert') {
          setEtat('ouvert');
        } else {
          fin.current = true;
          setChamp(null);
          if (m.etat === 'connecte') {
            setNom(m.nom ?? '');
            setEtat('connecte');
            surConnexion.current?.(m.nom ?? '');
          } else {
            setMessage(m.message || (m.etat === 'echec' ? texts.failed : texts.closed));
            setEtat(m.etat);
          }
        }
      };
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        if (arrete || fin.current) return;
        if (reprises.current < 1) {
          reprises.current += 1;
          minuterieReprise = setTimeout(ouvrir, 1000);
        } else {
          setChamp(null);
          setEtat('coupure');
        }
      };
    };
    ouvrir();
    // Page quittée pour de bon : la connexion est rendue tout de suite au serveur (sinon elle attend 5 minutes).
    const quitter = () => { const ws = socket.current; if (ws && ws.readyState === WebSocket.OPEN && !fin.current) ws.send(JSON.stringify({ t: 'fin' })); };
    window.addEventListener('pagehide', quitter);
    return () => {
      arrete = true;
      window.removeEventListener('pagehide', quitter);
      if (minuterieReprise) clearTimeout(minuterieReprise);
      if (enAttente.current) { clearTimeout(enAttente.current.minuterie); enAttente.current = null; }
      const ws = socket.current;
      socket.current = null;
      if (ws) ws.close(); // sans « fin » : un deuxième montage (mode strict de React) reprend la même page
    };
  }, [wsUrl, token, texts.failed, texts.closed]);

  // Échelle entre la page du serveur et l'écran affiché ici.
  useEffect(() => {
    const el = cadre.current;
    if (!el || !page) return;
    const maj = () => setEchelle(el.clientWidth / page.w || 1);
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);

  // Défilement (molette ou doigt) envoyé à la page une fois par image d'animation, en pixels de la page.
  const defiler = useCallback((dyEcran: number) => {
    defileCumul.current += dyEcran;
    if (defileImage.current !== null) return;
    defileImage.current = requestAnimationFrame(() => {
      defileImage.current = null;
      const dy = Math.round(defileCumul.current / (echelle || 1));
      defileCumul.current = 0;
      if (dy) envoyer({ t: 'defile', dy });
    });
  }, [echelle, envoyer]);
  useEffect(() => () => { if (defileImage.current !== null) cancelAnimationFrame(defileImage.current); }, []);

  // Molette : sans faire défiler la page du site.
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      if (etat !== 'ouvert') return;
      e.preventDefault();
      defiler(e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [etat, defiler]);

  // Le champ posé par-dessus prend le focus dès qu'il apparaît (le clavier du téléphone s'ouvre).
  useEffect(() => { if (champ) champRef.current?.focus({ preventScroll: true }); }, [champ?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e: { clientX: number; clientY: number }) => {
    const r = ecran.current?.getBoundingClientRect();
    if (!r || !page) return null;
    return { x: Math.round((e.clientX - r.left) / echelle), y: Math.round((e.clientY - r.top) / echelle) };
  };
  // Doigt ou souris : un appui sans glisser est un clic, un glissé fait défiler la page.
  const appui = (e: ReactPointer<HTMLDivElement>) => {
    if (etat !== 'ouvert' || e.target === champRef.current) return;
    glisse.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dernierY: e.clientY, defile: false };
  };
  const bouge = (e: ReactPointer<HTMLDivElement>) => {
    const g = glisse.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.defile && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.defile = true;
    if (g.defile) {
      const dy = g.dernierY - e.clientY;
      g.dernierY = e.clientY;
      if (dy) defiler(dy);
    }
  };
  const relache = (e: ReactPointer<HTMLDivElement>) => {
    const g = glisse.current;
    glisse.current = null;
    if (!g || g.id !== e.pointerId || g.defile || etat !== 'ouvert') return;
    const p = point(e);
    if (p) envoyer({ t: 'clic', x: p.x, y: p.y });
  };

  const saisie = (e: ReactChange<HTMLInputElement>) => {
    const s = e.target.value;
    setChamp((c) => (c ? { ...c, valeur: s } : c));
    if (enAttente.current) clearTimeout(enAttente.current.minuterie);
    enAttente.current = { s, minuterie: setTimeout(() => { enAttente.current = null; envoyerBrut({ t: 'remplir', s }); }, 200) };
  };
  const touche = (e: ReactKey<HTMLInputElement>) => {
    const s = e.currentTarget.value;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (enAttente.current) { clearTimeout(enAttente.current.minuterie); enAttente.current = null; }
      envoyerBrut({ t: 'remplir', s, entree: true });
    } else if (e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault();
      envoyer({ t: 'touche', k: e.key });
    }
  };

  const recommencer = () => { if (onRetry) onRetry(); else window.location.reload(); };
  const annuler = () => { envoyer({ t: 'fin' }); };

  if (etat === 'connecte') {
    return (
      <div className="lk-live">
        <p className="lk-status lk-ok" role="status">{texts.connected.replace('{nom}', nom ? ` (${nom})` : '')}</p>
      </div>
    );
  }
  if (etat === 'echec' || etat === 'ferme' || etat === 'coupure') {
    return (
      <div className="lk-live">
        <p className="lk-status" role="alert">{etat === 'coupure' ? texts.network : message}</p>
        <div className="lk-actions"><button type="button" className="btn btn-sm lk-btn" onClick={recommencer}>{texts.retry}</button></div>
      </div>
    );
  }
  const a = champ ? attributs(champ) : null;
  return (
    <div className="lk-live">
      <p className="lk-hint">{etat === 'ouverture' && !image ? texts.opening : texts.hint}</p>
      <div
        ref={cadre}
        className="lk-frame"
        onPointerDown={appui}
        onPointerMove={bouge}
        onPointerUp={relache}
        onPointerCancel={() => { glisse.current = null; }}
        style={{ touchAction: 'none', userSelect: 'none', position: 'relative' }}
      >
        <img ref={ecran} className="lk-screen" alt={texts.screen} draggable={false} style={{ display: image ? 'block' : 'none', width: '100%', height: 'auto' }} />
        {!image && <div className="lk-wait" aria-busy="true">{texts.opening}</div>}
        {champ && a && (
          <input
            key={champ.id}
            ref={champRef}
            className="lk-input"
            type={a.type}
            inputMode={a.inputMode}
            autoComplete={a.autoComplete}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={champ.valeur}
            onChange={saisie}
            onKeyDown={touche}
            style={{
              position: 'absolute',
              left: champ.x * echelle,
              top: champ.y * echelle,
              width: Math.max(champ.l * echelle, 40),
              height: Math.max(champ.h * echelle, 28),
              fontSize: Math.max(16, champ.fs * echelle), // 16 px au moins : sinon Safari zoome sur iPhone
              paddingLeft: champ.pg * echelle,
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>
      <div className="lk-actions"><button type="button" className="btn btn-sm btn-ghost lk-btn" onClick={annuler}>{texts.cancel}</button></div>
    </div>
  );
}
