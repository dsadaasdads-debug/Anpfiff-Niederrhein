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
 * Holt eine Adresse und versucht es bei vorübergehenden Störungen erneut.
 *
 * Nötig, weil ein einzelner Netzhänger auf dem GitHub-Runner sonst eine Quelle
 * für eine ganze Stunde stillschweigend ausfallen lässt. Wiederholt wird nur
 * bei Zeitüberschreitungen, Verbindungsabbrüchen und den Serverfehlern, die
 * erfahrungsgemäß von selbst vergehen – nicht bei 404 oder 403.
 */
async function holeMitWiederholung(url, { kopf, timeoutMs, versuche = 3 }) {
  let letzterFehler = null;

  for (let versuch = 1; versuch <= versuche; versuch++) {
    try {
      const res = await fetch(url, {
        headers: kopf,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });

      // Dauerhafte Ablehnungen nicht wiederholen – das ändert sich nicht.
      if (!res.ok && ![408, 429, 500, 502, 503, 504].includes(res.status)) {
        return { res, fehler: `HTTP ${res.status}` };
      }
      if (res.ok) return { res, fehler: null };
      letzterFehler = `HTTP ${res.status}`;
    } catch (err) {
      letzterFehler = err.name === 'TimeoutError' ? 'Zeitüberschreitung' : err.message;
    }

    if (versuch < versuche) {
      // 1s, dann 3s – lang genug für einen Aussetzer, kurz genug für den Lauf.
      await new Promise((r) => setTimeout(r, versuch * 2000 - 1000));
    }
  }
  return { res: null, fehler: letzterFehler };
}

/**
 * @returns {Promise<{teaser:string, bild:string, paywall:boolean|null, fehler:string|null}>}
 */
export async function artikelDetails(url, { timeoutMs = 20000 } = {}) {
  const { res, fehler } = await holeMitWiederholung(url, { kopf: { 'User-Agent': UA }, timeoutMs });
  if (!res || fehler) return { teaser: '', bild: '', paywall: null, fehler: fehler ?? 'unbekannt' };

  const html = await res.text();
  return {
    teaser: meta(html, 'og:description') || meta(html, 'description'),
    bild: meta(html, 'og:image'),
    paywall: paywallErkennen(html),
    fehler: null,
  };
}

/** Holt einen Feed als Text. */
export async function feedLaden(url, { timeoutMs = 25000 } = {}) {
  const { res, fehler } = await holeMitWiederholung(url, {
    kopf: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    timeoutMs,
  });
  if (!res || fehler) throw new Error(fehler ?? 'unbekannt');
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
