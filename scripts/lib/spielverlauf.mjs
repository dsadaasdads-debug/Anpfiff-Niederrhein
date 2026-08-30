// Spielverlauf einer Partie von fussball.de.
//
// fussball.de legt den kompletten Verlauf als Attribut `data-match-events` ins
// Markup – und zwar im Klartext, weil die Seite daraus selbst ihre Zeitleiste
// zeichnet:
//
//   data-match-events="{'duration': 90,
//     'first-half': {'events': [{'time':'20','type':'goal','team':'home'},
//                               {'time':'38','type':'yellow-card','team':'away'}]}, …}"
//
// Daraus ergeben sich Minute, Ereignisart und Mannschaft. Der Spielstand folgt
// aus dem Abzählen der Tor-Ereignisse.
//
// NICHT verfügbar: die Namen der Torschützen. Die stehen zwar auf der Seite,
// aber wie die Ergebnisziffern in privaten Unicode-Zeichen mit wechselnder
// Spezialschrift – eine bewusste Sperre, die hier nicht umgangen wird.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Lesbare Bezeichnungen für die Ereignisarten, die fussball.de vergibt. */
export const EREIGNISARTEN = {
  goal: { name: 'Tor', zeichen: '⚽' },
  'own-goal': { name: 'Eigentor', zeichen: '⚽' },
  penalty: { name: 'Elfmetertor', zeichen: '⚽' },
  'yellow-card': { name: 'Gelbe Karte', zeichen: '🟨' },
  'yellow-red-card': { name: 'Gelb-Rote Karte', zeichen: '🟨🟥' },
  'red-card': { name: 'Rote Karte', zeichen: '🟥' },
  substitute: { name: 'Wechsel', zeichen: '🔁' },
  'penalty-missed': { name: 'Elfmeter verschossen', zeichen: '✗' },
};

const entwirren = (s) => s
  .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
  .replace(/&szlig;/g, 'ß').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Wandelt das Attribut in ein Objekt. fussball.de schreibt es mit einfachen
 * Anführungszeichen, deshalb der Umweg über einen Austausch – die Werte darin
 * sind ausschließlich Zahlen und kurze Schlüsselwörter, ein Apostroph kann
 * also nicht dazwischenfunken.
 */
function attributLesen(roh) {
  try {
    return JSON.parse(roh.replace(/&#0?39;/g, "'").replace(/'/g, '"'));
  } catch {
    return null;
  }
}

/**
 * Holt und zerlegt eine Spielseite.
 *
 * Wichtig: Die Zeitleiste `data-match-events` fehlt auf den allermeisten
 * Amateurspielseiten – in den Kreisligen tickert kaum jemand. Früher gab die
 * Funktion dann `null` zurück und warf damit auch den Ergebnisvermerk weg.
 * Jetzt wird der Ergebnisblock unabhängig davon gelesen.
 * @returns {Promise<null|{heim:string, gast:string, tore:{heim:number,gast:number}|null,
 *   ereignisse:{minute:number, art:string, name:string, zeichen:string, seite:'heim'|'gast'}[],
 *   dauer:number, abgeschlossen:boolean, url:string}>}
 */
export async function spielverlauf(url, { timeoutMs = 20000 } = {}) {
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Der Ergebnisblock steht auf jeder Spielseite, auch ohne Zeitleiste. Er sagt
  // dreierlei: ein Vermerk im Klartext („Ausfall“), zwei verschleierte Ziffern
  // (Ergebnis gemeldet) oder nichts (noch nichts eingetragen).
  const ergebnisblock = html.match(/<div class="result">([\s\S]{0,400}?)<\/div>/);
  const roh = ergebnisblock?.[1] ?? '';
  const vermerk = roh.match(/<span class="info-text">([\s\S]{0,60}?)<\/span>/);
  // Gemeldete Ziffern liegen in privaten Unicode-Zeichen mit wechselnder
  // Spezialschrift. Dass sie da sind, ist erkennbar – WAS dort steht, wird
  // bewusst nicht entschlüsselt. Das ist eine Zugangssperre, keine Hürde.
  const ergebnisGemeldet = /class="score-left"/.test(roh) && /&#x[0-9A-Fa-f]{4};/.test(roh);

  const attribut = html.match(/data-match-events="([^"]+)"/);
  const verlauf = attribut ? attributLesen(attribut[1]) : null;

  const ereignisse = [];
  for (const abschnitt of Object.values(verlauf ?? {})) {
    if (!abschnitt || typeof abschnitt !== 'object' || !Array.isArray(abschnitt.events)) continue;
    for (const e of abschnitt.events) {
      const art = EREIGNISARTEN[e.type] ?? { name: e.type, zeichen: '•' };
      ereignisse.push({
        minute: Number.parseInt(e.time, 10) || 0,
        art: e.type,
        name: art.name,
        zeichen: art.zeichen,
        seite: e.team === 'home' ? 'heim' : 'gast',
      });
    }
  }
  ereignisse.sort((a, b) => a.minute - b.minute);

  // Der Spielstand ergibt sich aus den Tor-Ereignissen. Ohne ein einziges
  // Ereignis gibt es keinen – ein gezähltes 0:0 wäre dann nur vorgetäuscht.
  const istTor = (e) => ['goal', 'own-goal', 'penalty'].includes(e.art);
  const tore = ereignisse.length === 0 ? null : {
    heim: ereignisse.filter((e) => istTor(e) && e.seite === 'heim').length,
    gast: ereignisse.filter((e) => istTor(e) && e.seite === 'gast').length,
  };

  const namen = [...html.matchAll(/<div class="club-name">([\s\S]{0,120}?)<\/div>/g)].map((m) => entwirren(m[1]));

  return {
    heim: namen[0] ?? '',
    gast: namen[1] ?? '',
    tore,
    ereignisse,
    // Ergebnis liegt vor, ist aber nicht lesbar – die App verweist dann auf die
    // Spielseite, statt eine leere Karte zu zeigen.
    ergebnisGemeldet,
    vermerk: vermerk ? entwirren(vermerk[1]) : null,
    dauer: Number(verlauf?.duration ?? 90) + Number(verlauf?.extraTimeDuration ?? 0),
    letzteMinute: ereignisse.at(-1)?.minute ?? 0,
    url,
  };
  // Ob das Spiel vorbei ist, entscheidet die Uhr, nicht die Ereignisliste:
  // ein Spiel mit dem letzten Tor in der 89. Minute wäre sonst „läuft noch“.
}
