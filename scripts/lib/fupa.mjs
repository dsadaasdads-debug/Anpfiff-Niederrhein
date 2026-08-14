// Spieltagsdaten von FuPa.
//
// FuPa betreibt unter api.fupa.net/v1 eine offene JSON-Schnittstelle ohne
// Schlüssel. Anders als bei fussball.de stehen dort **Spielernamen im
// Klartext** – die Vereine tickern ihre Spiele bei FuPa selbst und
// veröffentlichen die Daten damit freiwillig.
//
// Der Ticker steckt im Feld `highlights` des Spielobjekts:
//   { minute, additionalMinute, type: 'goal', subtype: 'goal_shoot',
//     homeGoal, awayGoal, primaryRole: { firstName, lastName }, secondaryRole }
//
// Zwei Dinge im Hinterkopf behalten:
//   * Die Daten sind von Menschen eingetragen, nicht amtlich. Nicht jedes Spiel
//     wird getickert; ob überhaupt, sagt `flags: ['ticker']` vorab.
//   * Minuten fehlen, wenn der Reporter sie nicht erfasst hat.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BASIS = 'https://api.fupa.net/v1';

async function json(pfad, { timeoutMs = 20000 } = {}) {
  const res = await fetch(BASIS + pfad, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${pfad}`);
  return res.json();
}

/** Deutsche Bezeichnungen für die Ereignisarten, die FuPa vergibt. */
const EREIGNIS = {
  goal: { name: 'Tor', zeichen: '⚽' },
  goal_shoot: { name: 'Tor', zeichen: '⚽' },
  goal_head: { name: 'Kopfballtor', zeichen: '⚽' },
  goal_penalty: { name: 'Elfmetertor', zeichen: '⚽' },
  goal_freekick: { name: 'Freistoßtor', zeichen: '⚽' },
  goal_own: { name: 'Eigentor', zeichen: '⚽' },
  card: { name: 'Karte', zeichen: '🟨' },
  card_yellow: { name: 'Gelbe Karte', zeichen: '🟨' },
  card_yellow_red: { name: 'Gelb-Rote Karte', zeichen: '🟨🟥' },
  card_red: { name: 'Rote Karte', zeichen: '🟥' },
  substitution: { name: 'Wechsel', zeichen: '🔁' },
  penalty_missed: { name: 'Elfmeter verschossen', zeichen: '✗' },
};

const bezeichnung = (typ, untertyp) => EREIGNIS[untertyp] ?? EREIGNIS[typ] ?? { name: typ ?? 'Ereignis', zeichen: '•' };

const personName = (rolle) => {
  if (!rolle) return null;
  const n = `${rolle.firstName ?? ''} ${rolle.lastName ?? ''}`.trim();
  return n || null;
};

/**
 * Alle Partien eines Gebiets an einem Tag, flach.
 * @param {string} gebiet z.B. 'moers' oder 'niederrhein'
 * @param {string} datum  ISO-Tag, z.B. '2026-08-16'
 */
export async function partienAmTag(gebiet, datum) {
  const wettbewerbe = await json(`/districts/${gebiet}/matches?day=${datum}`);
  if (!Array.isArray(wettbewerbe)) return [];

  const raus = [];
  for (const w of wettbewerbe) {
    for (const m of w.matches ?? []) {
      raus.push({
        id: m.id,
        slug: m.slug,
        wettbewerb: w.competition?.name ?? null,
        anpfiff: m.kickoff ?? null,
        heim: m.homeTeam?.name?.full ?? m.homeTeamName ?? '',
        gast: m.awayTeam?.name?.full ?? m.awayTeamName ?? '',
        tore: (m.homeGoal == null && m.awayGoal == null) ? null : { heim: m.homeGoal ?? 0, gast: m.awayGoal ?? 0 },
        abschnitt: m.section ?? null,      // PRE | LIVE | POST
        hatTicker: (m.flags ?? []).includes('ticker'),
        gebiet,
      });
    }
  }
  return raus;
}

/**
 * Ereignisse einer Partie – mit Spielernamen, sofern der Ticker sie führt.
 * @returns {Promise<{ereignisse:object[], tore:object|null, zuschauer:number|null,
 *   schiedsrichter:string|null, abschnitt:string|null}>}
 */
export async function spielverlauf(id) {
  const m = await json(`/matches/${id}`);

  const ereignisse = (m.highlights ?? []).map((h) => {
    const art = bezeichnung(h.type, h.subtype);
    return {
      minute: h.minute ?? 0,
      nachspielzeit: h.additionalMinute || 0,
      art: h.subtype ?? h.type,
      name: art.name,
      zeichen: art.zeichen,
      spieler: personName(h.primaryRole),
      fuer: personName(h.secondaryRole),     // bei Wechseln: der Ersetzte
      stand: (h.homeGoal == null) ? null : { heim: h.homeGoal, gast: h.awayGoal },
      teamSlug: h.team?.teamSlug ?? null,
      clubSlug: h.team?.clubSlug ?? null,
    };
  });

  // Ohne erfasste Minuten ist die Reihenfolge der Eintragung das Beste, was wir
  // haben – deshalb nur sortieren, wenn überhaupt Minuten vorliegen.
  if (ereignisse.some((e) => e.minute > 0)) {
    ereignisse.sort((a, b) => (a.minute - b.minute) || (a.nachspielzeit - b.nachspielzeit));
  }

  return {
    ereignisse,
    tore: (m.homeGoal == null && m.awayGoal == null) ? null : { heim: m.homeGoal ?? 0, gast: m.awayGoal ?? 0 },
    zuschauer: m.spectators ?? null,
    schiedsrichter: personName(m.referee) ?? m.refereeAlias ?? null,
    abschnitt: m.section ?? null,
    tickerAutor: m.tickerAuthor ? personName(m.tickerAuthor) : null,
  };
}

/**
 * Vergleichsform eines Vereinsnamens. Rechtsformen, Gründungsjahre und
 * gängige Abkürzungen fliegen raus, damit „SV Scherpenberg 1921“ und
 * „SV Scherpenberg“ zueinanderfinden.
 */
export function namensKern(name) {
  return String(name).toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/\b(1[89]\d{2}|20\d{2})\b/g, ' ')
    .replace(/\b\d{2}\/\d{2}\b/g, ' ')
    .replace(/\be\.?\s?v\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
