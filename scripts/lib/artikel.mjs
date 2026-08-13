// Holt zu einem Artikel das, was im RSS-Feed fehlt: Vorschautext, Bild und
// Paywall-Status.
//
// Nötig, weil RP Online im <description>-Feld durchgängig den Platzhalter
// "Sy Sy" ausliefert und der Paywall-Status im Feed überhaupt nicht auftaucht.
// Jeder Artikel wird genau einmal geholt; das Ergebnis bleibt im Bestand.

import { decodeEntities } from './rss.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Beide Verlage hinterlegen den Zugang im schema.org-Datensatz der Seite:
 *   RP Online   "isAccessibleForFree":false     (Boolean)
 *   NRZ / WAZ   "isAccessibleForFree":"False"   (Zeichenkette)
 * Am 13.08.2026 an je zwei freien und zwei kostenpflichtigen Artikeln geprüft.
 */
function paywallErkennen(html) {
  const normalisiert = html.replace(/&quot;/g, '"');
  const m = normalisiert.match(/"isAccessibleForFree"\s*:\s*"?(true|false)"?/i);
  if (!m) return null; // unbekannt – im Zweifel nicht ausblenden
  return m[1].toLowerCase() === 'false';
}

function meta(html, schluessel) {
  const muster = [
    new RegExp(`<meta[^>]+property=["']${schluessel}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${schluessel}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${schluessel}["'][^>]*content=["']([^"']*)["']`, 'i'),
  ];
  for (const re of muster) {
    const m = html.match(re);
    if (m && m[1].trim()) return decodeEntities(m[1]).trim();
  }
  return '';
}

/**
 * @returns {Promise<{teaser:string, bild:string, paywall:boolean|null, fehler:string|null}>}
 */
export async function artikelDetails(url, { timeoutMs = 15000 } = {}) {
  const abbruch = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: abbruch, redirect: 'follow' });
    if (!res.ok) return { teaser: '', bild: '', paywall: null, fehler: `HTTP ${res.status}` };
    const html = await res.text();

    return {
      teaser: meta(html, 'og:description') || meta(html, 'description'),
      bild: meta(html, 'og:image'),
      paywall: paywallErkennen(html),
      fehler: null,
    };
  } catch (err) {
    return { teaser: '', bild: '', paywall: null, fehler: err.name === 'TimeoutError' ? 'Zeitüberschreitung' : err.message };
  }
}

/** Holt einen Feed als Text. */
export async function feedLaden(url, { timeoutMs = 20000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Arbeitet eine Liste mit begrenzter Parallelität ab. */
export async function nacheinander(elemente, gleichzeitig, arbeit) {
  const ergebnisse = new Array(elemente.length);
  let index = 0;
  const arbeiter = Array.from({ length: Math.min(gleichzeitig, elemente.length) }, async () => {
    while (index < elemente.length) {
      const i = index++;
      ergebnisse[i] = await arbeit(elemente[i], i);
    }
  });
  await Promise.all(arbeiter);
  return ergebnisse;
}
