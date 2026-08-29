// Handball-Tabellen über die offene JSON-Schnittstelle von handball.net.
//
// Keine Verschleierung, kein Schlüssel, sauberes JSON – deutlich freundlicher
// als fussball.de. Die Endpunkte liefern je 20 Einträge, `?page=N` blättert.
//
// WICHTIG, weil es einen halben Tag Recherche gekostet hat: Der frühere
// Handball-Verband Niederrhein (Kennung `Niederrhein`, Präfix
// `nuliga.hvniederrhein.`) ist zum Spieljahr 2023/24 in **Handball Nordrhein**
// aufgegangen. Unter `Niederrhein` liegen nur noch tote Daten bis 23/24; die
// laufenden Spielklassen für Moers, Kamp-Lintfort und den Kreis Wesel stehen
// unter der Organisation `Nordrhein` in den Kreisen „Wesel“ und „Rhein-Ruhr“.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BASIS = 'https://www.handball.net/a/sportdata/1';

async function json(url, { timeoutMs = 20000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
  return res.json();
}

/** Blättert einen Sammel-Endpunkt vollständig durch. */
async function alleSeiten(pfad, { maxSeiten = 200, pauseMs = 90 } = {}) {
  const raus = [];
  const gesehen = new Set();
  for (let seite = 1; seite <= maxSeiten; seite++) {
    let antwort;
    try { antwort = await json(`${BASIS}${pfad}?page=${seite}`); } catch { break; }
    const daten = antwort?.data ?? [];
    if (daten.length === 0) break;
    let neu = 0;
    for (const x of daten) {
      if (gesehen.has(x.id)) continue;
      gesehen.add(x.id);
      raus.push(x);
      neu++;
    }
    if (neu === 0) break;   // die Schnittstelle wiederholt sich: Ende erreicht
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  return raus;
}

/** Alle Wettbewerbe einer Organisation. */
export const wettbewerbe = (organisation) => alleSeiten(`/organizations/${organisation}/tournaments`);

/** Aus „BZL M (WES 26/27)“ wird „26/27“. */
export function saisonVon(wettbewerb) {
  return (String(wettbewerb.acronym ?? '').match(/(\d\d\/\d\d)/) ?? [])[1] ?? null;
}

/** Erwachsenenbereich; Jugend würde die Ansicht sonst zumüllen. */
export const istErwachsen = (wettbewerb) => ['Men', 'Women'].includes(wettbewerb.ageGroup);

/**
 * Spielplan einer Mannschaft. Liegt unter /teams/{id}/schedule – nicht unter
 * /games oder /matches, die gibt es nicht.
 *
 * @returns {Promise<{id:string, tag:string, zeit:string|null, anpfiff:string|null,
 *   heim:string, gast:string, tore:{heim:number,gast:number}|null,
 *   wettbewerb:string|null, hinweis:string|null, url:string}[]>}
 */
export async function spielplan(teamId) {
  const antwort = await json(`${BASIS}/teams/${teamId}/schedule`);
  const spiele = antwort?.data ?? [];

  return spiele.map((s) => {
    const anpfiff = s.startsAt ?? s.kickoff ?? s.date ?? null;
    const d = anpfiff ? new Date(anpfiff) : null;
    const zz = (n) => String(n).padStart(2, '0');

    return {
      id: s.id ?? null,
      tag: d ? `${d.getFullYear()}-${zz(d.getMonth() + 1)}-${zz(d.getDate())}` : null,
      zeit: d ? `${zz(d.getHours())}:${zz(d.getMinutes())}` : null,
      anpfiff: d ? d.toISOString() : null,
      heim: s.homeTeam?.name ?? s.homeTeamName ?? '',
      gast: s.awayTeam?.name ?? s.awayTeamName ?? '',
      tore: (s.homeGoals == null && s.awayGoals == null)
        ? null
        : { heim: s.homeGoals ?? 0, gast: s.awayGoals ?? 0 },
      wettbewerb: s.tournament?.name ?? null,
      hinweis: s.state && s.state !== 'Post' && s.state !== 'Pre' ? String(s.state) : null,
      url: s.id ? `https://www.handball.net/spiele/${s.id}` : `https://www.handball.net/mannschaften/${teamId}/spielplan`,
    };
  });
}

/**
 * Tabelle eines Wettbewerbs, in dieselbe Form gebracht wie die Fußballtabellen.
 * Handball zählt Punkte als „20:4“ (Plus- und Minuspunkte); wir behalten die
 * Schreibweise für die Anzeige und ziehen die Pluspunkte zum Sortieren heraus.
 */
export async function tabelle(wettbewerbId) {
  const antwort = await json(`${BASIS}/tournaments/${wettbewerbId}/table`);
  const zeilen = antwort?.data?.rows ?? [];

  return zeilen.map((z) => {
    const punkteText = String(z.points ?? '');
    const pluspunkte = Number.parseInt(punkteText.split(':')[0], 10);
    return {
      platz: z.rank ?? null,
      verein: z.team?.name ?? '',
      teamId: z.team?.id ?? null,
      spiele: z.games ?? 0,
      siege: z.wins ?? 0,
      unentschieden: z.draws ?? 0,
      niederlagen: z.losses ?? 0,
      tore: `${z.goals ?? 0}:${z.goalsAgainst ?? 0}`,
      differenz: z.goalDifference ?? 0,
      punkte: Number.isNaN(pluspunkte) ? 0 : pluspunkte,
      punkteText: punkteText.includes(':') ? punkteText : null,
    };
  });
}
