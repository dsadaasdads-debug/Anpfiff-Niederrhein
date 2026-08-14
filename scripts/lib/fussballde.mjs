// Auslesen von fussball.de: Tabellen, Platzierungen und Spielpläne.
//
// Erlaubt: die robots.txt lautet dort "User-agent: * / Allow: /" mit nur zwei
// Ausnahmen, die uns nicht betreffen. Die Mannschaftsseiten werden zudem
// serverseitig gerendert, ein Browser ist nicht nötig.
//
// BEWUSSTE GRENZE: Die Ziffern gespielter Ergebnisse liefert fussball.de als
// private Unicode-Zeichen aus, lesbar nur über eine bei jedem Abruf wechselnde
// Spezialschrift. Das ist eine absichtliche technische Sperre. Wir umgehen sie
// nicht – Ergebnisse werden zu fussball.de verlinkt statt nachgebaut.
// Tabellen, Platzierungen, Punkte und kommende Spiele stehen im Klartext da
// und werden übernommen.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BASIS = 'https://www.fussball.de';

async function hole(url, { timeoutMs = 20000, ajax = false } = {}) {
  const kopf = { 'User-Agent': UA };
  if (ajax) kopf['X-Requested-With'] = 'XMLHttpRequest';
  const res = await fetch(url, { headers: kopf, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
  return res.text();
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };

function saubern(roh) {
  return roh
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in NAMED ? NAMED[n] : m))
    .replace(/[​-‍﻿]/g, '')   // fussball.de streut Nullbreiten-Leerzeichen in Vereinsnamen
    .replace(/\s+/g, ' ')
    .trim();
}

/** true, wenn der Text private Unicode-Zeichen enthält, also verschleiert ist. */
const istVerschleiert = (text) => /[-]/.test(text);

/**
 * Alle Mannschaften eines Vereins der aktuellen Saison.
 * @returns {Promise<{name:string, teamId:string, saison:string, url:string}[]>}
 */
export async function mannschaften(vereinSlug, vereinId) {
  const html = await hole(`${BASIS}/verein/${vereinSlug}/-/id/${vereinId}`);
  const re = /<a href="(https:\/\/www\.fussball\.de\/mannschaft\/[^"]+\/-\/saison\/(\d+)\/team-id\/([A-Z0-9]+))"[^>]*>([\s\S]{0,220}?)<\/a>/gi;

  const gefunden = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (gefunden.has(m[3])) continue;
    gefunden.set(m[3], { url: m[1], saison: m[2], teamId: m[3], name: saubern(m[4]) });
  }

  const alle = [...gefunden.values()];
  if (alle.length === 0) return [];
  const neuste = alle.map((t) => t.saison).sort().at(-1);
  return alle.filter((t) => t.saison === neuste);
}

/**
 * Wählt die erste Herrenmannschaft. Reserven (II, III), Alte Herren (Ü32)
 * und der Nachwuchs bleiben außen vor.
 */
export function ersteHerren(liste) {
  // Kein \b vor dem Ü: JavaScripts Wortgrenze kennt nur ASCII, zwischen einem
  // Leerzeichen und "Ü" sieht sie keine Grenze – der Ausschluss liefe ins Leere
  // und die Alten Herren würden als erste Mannschaft durchgehen.
  const istAlteHerren = (n) => /Ü\s?\d/i.test(n) || /\bAH\b/.test(n) || /Alt(e|herren)/i.test(n);
  const istReserve = (n) => /\b(II|III|IV|V)\b/.test(n) || /\b[2-9]\.\s*Mannschaft/i.test(n);

  const herren = liste.filter((t) => /^Herren\b/i.test(t.name));
  return herren.find((t) => !istAlteHerren(t.name) && !istReserve(t.name))
    ?? herren.find((t) => !istAlteHerren(t.name))
    ?? null;
}

/**
 * Profilangaben einer Mannschaft: Liga, Platz, Punkte, Torverhältnis.
 * Auf der Seite steht der Wert vor seiner Beschriftung.
 */
export async function mannschaftsprofil(teamUrl) {
  const html = await hole(teamUrl);

  const werte = new Map();
  // Das schließende Tag muss zum öffnenden passen, sonst bricht der Wert beim
  // ersten inneren Element ab – aus "Kreisliga B, Gruppe 3" würde "Kreisliga B,".
  const re = /<(a|p|span|div)\b[^>]*class="profile-value"[^>]*>([\s\S]{0,200}?)<\/\1>\s*<p class="profile-label">([^<]+)<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) werte.set(saubern(m[3]), saubern(m[2]));

  // Die Wettbewerbsangabe ist verlinkt und trägt die Staffelkennung.
  const staffel = html.match(/href="[^"]*\/staffel\/([A-Z0-9-]+)"[^>]*class="profile-value"/i)
                ?? html.match(/class="profile-value"[^>]*href="[^"]*\/staffel\/([A-Z0-9-]+)"/i);

  const zahl = (s) => {
    const n = Number.parseInt(String(s ?? '').replace(/\D+/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  };

  return {
    // fussball.de liefert im Profilfeld teils "Kreisliga B," – die Gruppe fehlt
    // dort schlicht. Das hängende Satzzeichen kommt weg, mehr ist nicht drin.
    liga: (werte.get('Wettbewerb') ?? '').replace(/[,;]\s*$/, '') || null,
    spielklasse: werte.get('Spielklasse') ?? null,
    platz: zahl(werte.get('Tabellenplatz')),
    punkte: zahl(werte.get('Punkte')),
    torverhaeltnis: werte.get('Torverhältnis') ?? null,
    staffelId: staffel ? staffel[1] : null,
  };
}

/**
 * Die Tabelle einer Staffel. Steht vollständig im Klartext.
 * @returns {Promise<{platz:number, verein:string, spiele:number, siege:number,
 *   unentschieden:number, niederlagen:number, tore:string, differenz:number, punkte:number}[]>}
 */
export async function tabelle(staffelId) {
  const html = await hole(`${BASIS}/ajax.table/-/staffel/${staffelId}`, { ajax: true });

  const zeilen = [];
  for (const treffer of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const zeile = treffer[1];
    if (!zeile.includes('column-rank')) continue;

    const platz = Number.parseInt((zeile.match(/class="column-rank"[^>]*>\s*(\d+)/i) ?? [])[1], 10);
    // Der Name im Logo-alt ist sauberer als der Fließtext, der
    // Nullbreiten-Leerzeichen enthält.
    const verein = saubern((zeile.match(/<img[^>]+alt="([^"]+)"/i)
      ?? zeile.match(/data-alt="([^"]+)"/i)
      ?? zeile.match(/class="club-name"[^>]*>([\s\S]*?)<\/div>/i) ?? [])[1] ?? '');

    // Die Zahlenspalten in Reihenfolge: Spiele, S, U, N, Tore, Differenz, Punkte.
    const zellen = [...zeile.matchAll(/<td(?![^>]*column-(?:icon|rank|club))[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((z) => saubern(z[1]));

    // Jede Zeile verlinkt ihre Mannschaft. Über diese Kennung erkennt die App
    // die eigenen Vereine zuverlässig – ein Namensvergleich scheitert daran,
    // dass die Tabelle "GSV Moers" schreibt, wo unsere Liste
    // "Grafschafter SV 1910 Moers" führt.
    const teamId = (zeile.match(/\/team-id\/([A-Z0-9]+)/i) ?? [])[1] ?? null;

    if (!Number.isFinite(platz) || !verein || zellen.length < 7) continue;

    const n = (i) => {
      const v = Number.parseInt(zellen[i], 10);
      return Number.isNaN(v) ? 0 : v;
    };

    zeilen.push({
      platz,
      verein,
      teamId,
      spiele: n(0),
      siege: n(1),
      unentschieden: n(2),
      niederlagen: n(3),
      tore: zellen[4]?.replace(/\s+/g, '') ?? '0:0',
      differenz: Number.parseInt(zellen[5], 10) || 0,
      punkte: n(6),
    });
  }
  return zeilen;
}

/**
 * Spielplan einer Mannschaft.
 * @param {'next'|'prev'} richtung
 * @returns {Promise<{datum:string, wettbewerb:string, heim:string, gast:string,
 *   url:string|null, ergebnisVerschleiert:boolean, hinweis:string|null}[]>}
 */
export async function spiele(teamId, richtung = 'next') {
  const pfad = richtung === 'prev' ? 'ajax.team.prev.games' : 'ajax.team.next.games';
  const html = await hole(`${BASIS}/${pfad}/-/mode/PAGE/team-id/${teamId}`, { ajax: true });

  const ergebnis = [];
  let kopf = null;

  for (const treffer of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const zeile = treffer[1];

    // Kopfzeile: „Sonntag, 16.08.2026 - 15:00 Uhr | Landesliga“
    const ueberschrift = zeile.match(/<td colspan="6"[^>]*>([\s\S]*?)<\/td>/i);
    if (ueberschrift) {
      const text = saubern(ueberschrift[1]);
      const teile = text.split('|').map((t) => t.trim());
      kopf = { datum: teile[0] ?? text, wettbewerb: teile[1] ?? '' };
      continue;
    }

    const vereine = [...zeile.matchAll(/data-alt="([^"]+)"/gi)].map((m) => saubern(m[1]));
    if (vereine.length < 2 || !kopf) continue;

    const spielLink = zeile.match(/href="(https:\/\/www\.fussball\.de\/spiel\/[^"]+)"/i);
    const infoText = zeile.match(/class="info-text"[^>]*>([^<]*)</i);
    const punktstand = zeile.match(/class="column-score"[^>]*>([\s\S]*?)<\/td>/i);

    ergebnis.push({
      datum: kopf.datum,
      wettbewerb: kopf.wettbewerb,
      heim: vereine[0],
      gast: vereine[1],
      url: spielLink ? spielLink[1] : null,
      // Bei gespielten Partien stehen hier verschleierte Ziffern. Wir geben das
      // offen an, statt eine Zahl zu erfinden.
      ergebnisVerschleiert: punktstand ? istVerschleiert(punktstand[1]) : false,
      hinweis: infoText ? saubern(infoText[1]) : null,
    });
  }
  return ergebnis;
}
