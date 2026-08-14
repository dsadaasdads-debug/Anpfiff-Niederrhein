/* Anpfiff Niederrhein — Oberflächenlogik.
   Kein Framework, kein Bauschritt: die Seite lädt data/feed.json und stellt sie dar. */

(() => {
  'use strict';

  const SPEICHER = 'anpfiff:einstellungen';

  // Interner Schlüssel für Meldungen ohne erkannte Sportart.
  const SONSTIGE = '—sonstige—';
  const EREIGNISSE = '—ereignisse—';
  const sportVon = (artikel) => artikel.sportart ?? SONSTIGE;

  const VORGABE = {
    thema: null,                    // null = der Systemeinstellung folgen
    sortierung: 'relevanz',
    paywallZeigen: false,           // ab Werk aus, jederzeit umschaltbar
    favoriten: ['1. FC Lintfort'],
    ausgeblendeteSportarten: [],
    ausgeblendeteOrte: [],
    gelesen: [],
    letzterBesuch: null,
    ligaFavoriten: [],
    nurFavoritenTabellen: false,
    favoritenSportarten: [],
  };

  let einstellungen = laden();
  let daten = null;
  let tabellendaten = null;         // wird erst beim ersten Wechsel geholt
  let ansicht = 'meldungen';        // 'meldungen' | 'tabellen'
  let tabellenmodus = 'liga';       // 'liga' | 'verein'
  let tabellensport = 'alle';       // 'alle' | Name einer Sportart
  let auswahl = 'alle';             // 'alle' | 'favoriten' | Name einer Sportart
  let suchtext = '';
  let zuletztGeholt = 0;
  /** Zeitpunkt des vorigen Besuchs, beim Start eingefroren. */
  let besuchVorher = null;
  /** Gelesene Kennungen als Menge, für schnelles Nachschlagen. */
  let gelesen = new Set();

  const $ = (id) => document.getElementById(id);
  const el = (tag, klasse, text) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  };

  function svgIkone(klasse, d, gefuellt = false) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', klasse);
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    if (gefuellt) p.setAttribute('fill', 'currentColor');
    s.append(p);
    return s;
  }

  const STERN = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z';
  const HAKEN = 'M5 12.5l4.5 4.5L19 7.5';
  const KREIS = 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z';

  // ── Einstellungen ────────────────────────────────────────────────────────

  function laden() {
    try {
      const roh = localStorage.getItem(SPEICHER);
      return roh ? { ...VORGABE, ...JSON.parse(roh) } : { ...VORGABE };
    } catch {
      return { ...VORGABE };
    }
  }

  function sichern() {
    try { localStorage.setItem(SPEICHER, JSON.stringify(einstellungen)); } catch { /* Privatmodus */ }
  }

  function themaAnwenden() {
    if (einstellungen.thema) document.documentElement.dataset.thema = einstellungen.thema;
    else delete document.documentElement.dataset.thema;
  }

  /** Schaltet einen Eintrag in einer Ausblendliste um. */
  function umschalten(liste, wert) {
    const i = liste.indexOf(wert);
    if (i >= 0) liste.splice(i, 1); else liste.push(wert);
    sichern();
  }

  // ── Zeitangaben ──────────────────────────────────────────────────────────

  const rel = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
  const datumLang = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const datumKurz = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });

  function zeitText(iso) {
    if (!iso) return '';
    const dann = Date.parse(iso);
    if (Number.isNaN(dann)) return '';
    const minuten = Math.round((dann - Date.now()) / 60000);
    if (Math.abs(minuten) < 60) return rel.format(minuten, 'minute');
    const stunden = Math.round(minuten / 60);
    if (Math.abs(stunden) < 24) return rel.format(stunden, 'hour');
    const tage = Math.round(stunden / 24);
    if (Math.abs(tage) < 7) return rel.format(tage, 'day');
    return datumKurz.format(new Date(dann));
  }

  // ── Auswahl und Reihenfolge ──────────────────────────────────────────────

  const istFavorit = (a) => a.vereine.some((v) => einstellungen.favoriten.includes(v));

  /** Neu seit dem vorigen Besuch – und noch nicht gelesen. */
  const istNeu = (a) => Boolean(besuchVorher) && !gelesen.has(a.id)
    && (Date.parse(a.datum) || 0) > Date.parse(besuchVorher);

  function alsGelesenMerken(id) {
    if (gelesen.has(id)) return;
    gelesen.add(id);
    einstellungen.gelesen = [...gelesen];
    sichern();
    gelesenstandZeigen();
  }

  function gelesenstandZeigen() {
    const feld = $('gelesen-stand');
    if (!feld || !daten) return;
    const imBestand = daten.artikel.filter((a) => gelesen.has(a.id)).length;
    feld.textContent = imBestand === 0
      ? 'Du hast noch keine Meldung geöffnet. Geöffnete werden abgeblendet dargestellt.'
      : `${imBestand} von ${daten.artikel.length} Meldungen sind als gelesen vermerkt. Sie werden abgeblendet, aber nicht ausgeblendet.`;
  }

  const ortVersteckt = (a) =>
    a.orte.length > 0 && a.orte.every((o) => einstellungen.ausgeblendeteOrte.includes(o));

  function sucheTrifft(a) {
    if (!suchtext) return true;
    const heuhaufen = [a.titel, a.teaser, a.ort, a.sportart, a.quelle, ...a.vereine]
      .join(' ').toLowerCase();
    return heuhaufen.includes(suchtext);
  }

  /**
   * Abgewählte Orte gelten überall – wer Duisburg nicht will, will es nirgends.
   * Abgewählte Sportarten gelten nur im Hauptfeed: den Reiter einer Sportart
   * aufzurufen ist eine ausdrückliche Ansage und schlägt die Voreinstellung.
   */
  function sichtbar(a) {
    if (!einstellungen.paywallZeigen && a.paywall === true) return false;
    if (ortVersteckt(a)) return false;
    if (!sucheTrifft(a)) return false;

    if (auswahl === 'favoriten') return istFavorit(a);
    if (auswahl === EREIGNISSE) return Boolean(a.ereignis);
    if (auswahl !== 'alle') return sportVon(a) === auswahl;
    return !einstellungen.ausgeblendeteSportarten.includes(sportVon(a));
  }

  function reihenfolge(a, b) {
    if (einstellungen.sortierung === 'neueste') {
      return (Date.parse(b.datum) || 0) - (Date.parse(a.datum) || 0);
    }
    // "Für dich": die vom Sammler berechnete Sortierzeit (mit Zonendämpfung),
    // zusätzlich rücken eigene Vereine um drei Tage nach vorn.
    const bonus = (x) => (istFavorit(x) ? 72 * 3600_000 : 0);
    return (b.sortZeit + bonus(b)) - (a.sortZeit + bonus(a));
  }

  /** Zählt, wie viele Meldungen eine bestimmte Auswahl ergäbe. */
  function zaehleFuer(wert) {
    const merken = auswahl;
    auswahl = wert;
    const n = daten.artikel.filter(sichtbar).length;
    auswahl = merken;
    return n;
  }

  // ── Darstellung ──────────────────────────────────────────────────────────

  /**
   * Sportarten im Bestand. Markierte zuerst – in der Reihenfolge, in der sie
   * markiert wurden –, danach die übrigen nach Häufigkeit.
   */
  function sportartenImBestand() {
    const zaehler = new Map();
    for (const a of daten.artikel) zaehler.set(sportVon(a), (zaehler.get(sportVon(a)) ?? 0) + 1);

    const markiert = einstellungen.favoritenSportarten;
    return [...zaehler.entries()]
      .map(([name, n]) => ({ name, n, rang: markiert.indexOf(name) }))
      .sort((a, b) => {
        if (a.rang >= 0 && b.rang >= 0) return a.rang - b.rang;
        if (a.rang >= 0) return -1;
        if (b.rang >= 0) return 1;
        return b.n - a.n;
      });
  }

  function chipsZeichnen() {
    const behaelter = $('filter');
    behaelter.replaceChildren();

    const eintraege = [
      ['alle', 'Alle'],
      ['favoriten', '★ Meine Vereine'],
      // Erscheint von selbst, sobald Großereignisse laufen, und verschwindet
      // wieder, wenn die letzte Meldung dazu aus dem Archiv gefallen ist.
      [EREIGNISSE, '🏅 Großereignisse'],
      ...sportartenImBestand().map((s) => [s.name, s.name === SONSTIGE ? 'Sonstiges' : s.name]),
    ];

    for (const [wert, beschriftung] of eintraege) {
      const n = zaehleFuer(wert);
      // Sportarten ohne sichtbare Meldung gar nicht erst anbieten.
      if (n === 0 && wert !== 'alle' && wert !== auswahl) continue;

      const knopf = el('button', 'chip');
      knopf.type = 'button';
      knopf.setAttribute('aria-pressed', String(auswahl === wert));
      knopf.append(document.createTextNode(beschriftung), el('span', 'zahl', String(n)));
      knopf.addEventListener('click', () => {
        auswahl = wert;
        zeichnen();
        scrollTo({ top: 0, behavior: 'smooth' });
      });
      behaelter.append(knopf);
    }
  }

  /**
   * Die Karte ist ein <article>, nicht ein großes <a>. Nur der Titel ist der
   * eigentliche Link; er überzieht die Karte per CSS-Pseudoelement. So bleibt
   * die ganze Fläche anklickbar, und die Vereinsmarken darüber können echte
   * Schaltflächen sein – Schaltflächen in einem Link wären ungültiges Markup.
   */
  function karteBauen(artikel) {
    const karte = el('article', 'karte');
    karte.dataset.zone = artikel.zone;
    karte.dataset.id = artikel.id;   // für das Halten der Leseposition

    const innen = el('div', 'karte-innen');

    if (artikel.bild) {
      const bild = el('img', 'karte-bild');
      bild.src = artikel.bild;
      bild.alt = '';
      bild.loading = 'lazy';
      bild.decoding = 'async';
      bild.addEventListener('error', () => bild.remove());
      innen.append(bild);
    }

    const text = el('div', 'karte-text');

    if (gelesen.has(artikel.id)) karte.classList.add('gelesen');

    const ueberschrift = el('h2');
    const link = el('a', 'karte-titel');
    link.href = artikel.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (istNeu(artikel)) {
      const punkt = el('span', 'neu-punkt');
      punkt.title = 'Neu seit deinem letzten Besuch';
      link.append(punkt);
    }
    link.append(document.createTextNode(artikel.titel));
    // Kein Neuzeichnen beim Öffnen: die Karte soll unter dem Finger bleiben.
    link.addEventListener('click', () => {
      alsGelesenMerken(artikel.id);
      karte.classList.add('gelesen');
    });
    ueberschrift.append(link);
    text.append(ueberschrift);

    if (artikel.teaser) text.append(el('p', null, artikel.teaser));

    const marken = el('div', 'marken');
    // Ortsmarke nur, wenn der Ort belegt ist – nicht wenn er bloß aus dem
    // Redaktionspfad stammt. Sonst behaupten wir mehr, als wir wissen.
    if (artikel.ort && artikel.ortSicher !== false) {
      marken.append(el('span', 'marke-etikett ort', artikel.ort));
    }
    if (artikel.sportart) marken.append(el('span', 'marke-etikett', artikel.sportart));

    for (const verein of artikel.vereine.slice(0, 3)) {
      const markiert = einstellungen.favoriten.includes(verein);
      const knopf = el('button', `marke-etikett verein-knopf ${markiert ? 'stern' : 'verein'}`,
        markiert ? `★ ${verein}` : `+ ${verein}`);
      knopf.type = 'button';
      knopf.title = markiert ? `${verein} aus „Meine Vereine“ entfernen` : `${verein} zu „Meine Vereine“ hinzufügen`;
      knopf.setAttribute('aria-pressed', String(markiert));
      knopf.addEventListener('click', () => {
        umschalten(einstellungen.favoriten, verein);
        // Ohne Anker springt genau der Artikel weg, auf dem man getippt hat:
        // als Favorit rückt er drei Tage vor und landet weit oben in der Liste.
        mitLesepositionZeichnen(knopf.closest('.karte'));
        vereineZeichnen($('vereinssuche').value.trim().toLowerCase());
      });
      marken.append(knopf);
    }

    if (artikel.paywall === true) marken.append(el('span', 'marke-etikett schloss', '🔒 Bezahlartikel'));
    if (marken.childElementCount) text.append(marken);

    const fuss = el('div', 'karte-fuss');
    fuss.append(el('span', 'quelle', artikel.quelle));
    const zeit = zeitText(artikel.datum);
    if (zeit) fuss.append(el('span', null, '·'), el('span', null, zeit));
    text.append(fuss);

    innen.append(text);
    karte.append(innen);
    return karte;
  }

  const tagName = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  /** „Heute“, „Gestern“ oder „Sonntag, 10. August“. */
  function tagBeschriftung(iso) {
    const d = new Date(Date.parse(iso));
    const heute = new Date();
    const tage = Math.round((new Date(heute.getFullYear(), heute.getMonth(), heute.getDate())
      - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
    if (tage === 0) return 'Heute';
    if (tage === 1) return 'Gestern';
    return tagName.format(d);
  }

  const tagSchluessel = (iso) => (iso ?? '').slice(0, 10);

  function zeichnen() {
    if (!daten) return;

    chipsZeichnen();

    const treffer = daten.artikel.filter(sichtbar).sort(reihenfolge);

    // Datumstrenner nur bei „Neueste zuerst“. In „Für dich“ ist die Reihenfolge
    // absichtlich nicht chronologisch – dort ergäben Trenner „Heute, Gestern,
    // Heute“ oder stellten einen heutigen Duisburger Artikel unter „Gestern“.
    const knoten = [];

    if (auswahl === EREIGNISSE) {
      // Im Ereignis-Reiter nach Ereignis gruppieren, nicht nach Datum: erst
      // die größten Wettbewerbe, innerhalb davon die neuesten Meldungen.
      const gruppen = new Map();
      for (const a of treffer) {
        const s = a.ereignis.schluessel;
        if (!gruppen.has(s)) gruppen.set(s, { ereignis: a.ereignis, artikel: [] });
        gruppen.get(s).artikel.push(a);
      }
      const sortiert = [...gruppen.values()].sort((a, b) => b.artikel.length - a.artikel.length
        || a.ereignis.name.localeCompare(b.ereignis.name, 'de'));
      for (const g of sortiert) {
        const titel = g.ereignis.ort ? `${g.ereignis.name} · ${g.ereignis.ort}` : g.ereignis.name;
        knoten.push(el('h3', 'tagtrenner', titel));
        for (const a of g.artikel) knoten.push(karteBauen(a));
      }
    } else {
      const mitTrennern = einstellungen.sortierung === 'neueste';
      let letzterTag = null;
      for (const artikel of treffer) {
        if (mitTrennern && artikel.datum) {
          const tag = tagSchluessel(artikel.datum);
          if (tag !== letzterTag) {
            knoten.push(el('h3', 'tagtrenner', tagBeschriftung(artikel.datum)));
            letzterTag = tag;
          }
        }
        knoten.push(karteBauen(artikel));
      }
    }
    $('liste').replaceChildren(...knoten);

    const neue = treffer.filter(istNeu).length;
    const hinweis = $('neuhinweis');
    hinweis.hidden = neue === 0;
    if (neue > 0) hinweis.textContent = neue === 1
      ? '1 neue Meldung seit deinem letzten Besuch'
      : `${neue} neue Meldungen seit deinem letzten Besuch`;

    gelesenstandZeigen();

    const leer = $('leer');
    const versteckt = daten.artikel.filter((x) => x.paywall === true).length;
    if (treffer.length === 0) {
      leer.hidden = false;
      leer.textContent = suchtext
        ? `Keine Meldung passt zu „${suchtext}“.`
        : !einstellungen.paywallZeigen && versteckt > 0
          ? `Hier steht gerade nichts. ${versteckt} Meldungen sind ausgeblendet, weil sie hinter einer Bezahlschranke stehen — du kannst sie in den Einstellungen einblenden.`
          : 'Hier steht gerade nichts.';
    } else {
      leer.hidden = true;
    }

    $('ansage').textContent = `${treffer.length} Meldungen`;

    const stand = Date.parse(daten.aktualisiert);
    $('stand').textContent = Number.isNaN(stand)
      ? ''
      : `${treffer.length} von ${daten.artikel.length} Meldungen · zuletzt aktualisiert ${zeitText(daten.aktualisiert)} (${datumLang.format(new Date(stand))}) · Archiv der letzten ${daten.behaltenTage} Tage`;

    $('paywall-erklaerung').textContent = einstellungen.paywallZeigen
      ? `Bezahlartikel werden mitgezeigt und mit einem Schloss gekennzeichnet. Derzeit betrifft das ${versteckt} Meldungen.`
      : `Derzeit sind ${versteckt} Meldungen ausgeblendet. RP Online und NRZ stellen einen Teil des Lokalsports hinter die Schranke — wenn dir der Feed zu dünn wird, schalte sie hier ein.`;
  }

  /**
   * Zeichnet neu und hält dabei die Leseposition. Ohne das rutscht der Artikel,
   * den man gerade liest, unter dem Finger weg, sobald sich die Reihenfolge
   * ändert.
   */
  function mitLesepositionZeichnen(bevorzugt = null) {
    const OBERKANTE = 110;   // etwa die Höhe des klebenden Kopfes

    // Wenn die Aktion von einer bestimmten Karte ausging – etwa ein Tippen auf
    // deren Vereinsmarke –, dann muss genau die stehen bleiben. Sonst die
    // oberste sichtbare.
    let anker = null;
    if (bevorzugt?.dataset.id) {
      anker = { id: bevorzugt.dataset.id, oben: bevorzugt.getBoundingClientRect().top };
    } else {
      for (const karte of $('liste').children) {
        if (!karte.dataset.id) continue;   // Datumstrenner überspringen
        const kasten = karte.getBoundingClientRect();
        if (kasten.bottom > OBERKANTE) { anker = { id: karte.dataset.id, oben: kasten.top }; break; }
      }
    }

    zeichnen();

    if (!anker?.id) return;
    const wieder = $('liste').querySelector(`[data-id="${CSS.escape(anker.id)}"]`);
    if (wieder) scrollBy(0, wieder.getBoundingClientRect().top - anker.oben);
  }

  /** Baut eine Liste mit Häkchen zum Ein- und Ausblenden. */
  function wahllisteZeichnen(behaelterId, eintraege, ausgeblendet, beimUmschalten) {
    const behaelter = $(behaelterId);
    behaelter.replaceChildren();

    for (const { schluessel, name, zusatz } of eintraege) {
      const an = !ausgeblendet.includes(schluessel);
      const zeile = el('button', 'vereinszeile');
      zeile.type = 'button';
      zeile.setAttribute('aria-pressed', String(an));
      zeile.append(
        svgIkone('haken-ikone', an ? HAKEN : KREIS),
        el('span', 'vname', name),
        el('span', 'vort', zusatz),
      );
      zeile.addEventListener('click', () => {
        beimUmschalten(schluessel);
        zeichnen();
        einstellungslistenZeichnen();
      });
      behaelter.append(zeile);
    }
  }

  /**
   * Sportarten-Liste mit zwei Schaltern je Zeile: der Stern zieht die Sportart
   * im Reiterband nach vorn, das Häkchen blendet sie im Hauptfeed aus.
   */
  function sportartenlisteZeichnen() {
    const behaelter = $('sportartenliste');
    behaelter.replaceChildren();

    for (const s of sportartenImBestand()) {
      const zeile = el('div', 'wahlzeile');
      const gemerkt = einstellungen.favoritenSportarten.includes(s.name);
      const sichtbar = !einstellungen.ausgeblendeteSportarten.includes(s.name);

      const stern = el('button', 'zeilenknopf stern-knopf');
      stern.type = 'button';
      stern.setAttribute('aria-pressed', String(gemerkt));
      stern.title = gemerkt ? 'Nicht mehr vorn einsortieren' : 'Im Reiterband vorn einsortieren';
      stern.setAttribute('aria-label', `${s.name === SONSTIGE ? 'Sonstiges' : s.name}: ${stern.title}`);
      stern.append(svgIkone('stern-ikone', STERN));
      stern.addEventListener('click', () => {
        umschalten(einstellungen.favoritenSportarten, s.name);
        zeichnen();
        sportartenlisteZeichnen();
      });

      const haken = el('button', 'zeilenknopf haken-knopf');
      haken.type = 'button';
      haken.setAttribute('aria-pressed', String(sichtbar));
      haken.title = sichtbar ? 'Im Hauptfeed ausblenden' : 'Im Hauptfeed einblenden';
      haken.setAttribute('aria-label', `${s.name === SONSTIGE ? 'Sonstiges' : s.name}: ${haken.title}`);
      haken.append(svgIkone('haken-ikone', sichtbar ? HAKEN : KREIS));
      haken.addEventListener('click', () => {
        umschalten(einstellungen.ausgeblendeteSportarten, s.name);
        zeichnen();
        sportartenlisteZeichnen();
      });

      const name = el('span', `vname${sichtbar ? '' : ' durchgestrichen'}`, s.name === SONSTIGE ? 'Sonstiges' : s.name);
      zeile.append(stern, name, el('span', 'vort', String(s.n)), haken);
      behaelter.append(zeile);
    }
  }

  function einstellungslistenZeichnen() {
    sportartenlisteZeichnen();

    const zaehler = new Map();
    for (const a of daten.artikel) for (const o of a.orte) zaehler.set(o, (zaehler.get(o) ?? 0) + 1);
    const zonenName = { kern: 'Kernstadt', umland: 'Umland', duisburg: 'gedämpft' };
    const zoneVonOrt = new Map();
    for (const a of daten.artikel) if (a.ort) zoneVonOrt.set(a.ort, a.zone);

    wahllisteZeichnen(
      'orteliste',
      [...zaehler.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ort, n]) => ({
          schluessel: ort,
          name: ort,
          zusatz: `${zonenName[zoneVonOrt.get(ort)] ?? ''} · ${n}`,
        })),
      einstellungen.ausgeblendeteOrte,
      (o) => umschalten(einstellungen.ausgeblendeteOrte, o),
    );
  }

  function vereineZeichnen(suchbegriff = '') {
    const behaelter = $('vereinsliste');
    behaelter.replaceChildren();

    const zaehler = new Map();
    for (const artikel of daten.artikel) {
      for (const v of artikel.vereine) zaehler.set(v, (zaehler.get(v) ?? 0) + 1);
    }

    const rang = { kern: 0, umland: 1, duisburg: 2 };
    const liste = daten.vereine
      .filter((v) => v.name.toLowerCase().includes(suchbegriff))
      .sort((a, b) => {
        const fa = einstellungen.favoriten.includes(a.name) ? 0 : 1;
        const fb = einstellungen.favoriten.includes(b.name) ? 0 : 1;
        return fa - fb || rang[a.zone] - rang[b.zone] || (zaehler.get(b.name) ?? 0) - (zaehler.get(a.name) ?? 0)
          || a.name.localeCompare(b.name, 'de');
      });

    for (const verein of liste) {
      const zeile = el('button', 'vereinszeile');
      zeile.type = 'button';
      zeile.setAttribute('aria-pressed', String(einstellungen.favoriten.includes(verein.name)));

      const n = zaehler.get(verein.name) ?? 0;
      zeile.append(
        svgIkone('stern-ikone', STERN),
        el('span', 'vname', verein.name),
        el('span', 'vort', n > 0 ? `${verein.ort} · ${n}` : verein.ort),
      );
      zeile.addEventListener('click', () => {
        umschalten(einstellungen.favoriten, verein.name);
        vereineZeichnen($('vereinssuche').value.trim().toLowerCase());
        zeichnen();
      });
      behaelter.append(zeile);
    }

    if (liste.length === 0) behaelter.append(el('p', 'erklaerung', 'Kein Verein gefunden.'));

    const n = einstellungen.favoriten.length;
    $('vereine-zahl').textContent = n === 0 ? 'keiner gewählt' : n === 1 ? '1 gewählt' : `${n} gewählt`;
  }

  function quellenZeichnen() {
    const behaelter = $('quellenliste');
    behaelter.replaceChildren();
    for (const q of daten.quellen) {
      const zeile = el('div', 'quellenzeile');
      zeile.append(el('span', null, q.name));
      zeile.append(el('span', q.status === 'ok' ? 'status-ok' : 'status-fehler',
        q.status === 'ok' ? `${q.eintraege} Einträge` : `Fehler: ${q.fehler ?? 'unbekannt'}`));
      behaelter.append(zeile);
    }
  }

  // ── Tabellenansicht ──────────────────────────────────────────────────────

  /** „Sonntag, 16.08.2026 - 15:00 Uhr“ → „So 16.08. 15:00“ */
  function spielzeitKurz(roh) {
    const m = String(roh).match(/^(\w{2})\w*,\s*(\d{2}\.\d{2})\.\d{4}\s*-\s*(\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}. ${m[3]}` : roh;
  }

  function spiellisteBauen(spiele, verein) {
    const ul = el('ul', 'spielliste');
    for (const s of spiele) {
      const li = el('li');
      li.append(el('span', 'wann', spielzeitKurz(s.datum)));

      const paarung = el('span', 'paarung');
      for (const [i, mannschaft] of [s.heim, s.gast].entries()) {
        if (i === 1) paarung.append(document.createTextNode(' – '));
        paarung.append(el('span', mannschaft === verein ? 'eigen' : null, mannschaft));
      }
      li.append(paarung);

      if (s.hinweis) li.append(el('span', 'anmerkung', s.hinweis));

      if (s.url) {
        const a = el('a', null, s.ergebnisVerschleiert ? 'Ergebnis' : 'Details');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.append(a);
      }
      ul.append(li);
    }
    return ul;
  }

  /**
   * Baut eine Ligatabelle. Verglichen wird über die Mannschaftskennung, nicht
   * über den Namen: die Tabelle schreibt „GSV Moers“, wo unsere Vereinsliste
   * „Grafschafter SV 1910 Moers“ führt.
   * @param {Set<string>} heimisch      Kennungen aller Vereine aus der Region
   * @param {Set<string>} hervorgehoben Kennungen der davon markierten
   */
  function ligatabelleBauen(zeilen, heimisch, hervorgehoben) {
    const rahmen = el('div', 'tabellenrahmen');
    const tabelle = el('table', 'liga');

    const kopfzeile = el('tr');
    for (const [beschriftung, titel] of [['#', 'Platz'], ['Mannschaft', 'Mannschaft'], ['Sp', 'Spiele'],
      ['S', 'Siege'], ['U', 'Unentschieden'], ['N', 'Niederlagen'], ['Tore', 'Tore'], ['Diff', 'Tordifferenz'], ['Pkt', 'Punkte']]) {
      const th = el('th', null, beschriftung);
      th.scope = 'col';
      th.title = titel;
      kopfzeile.append(th);
    }
    const thead = el('thead');
    thead.append(kopfzeile);
    tabelle.append(thead);

    const tbody = el('tbody');
    for (const z of zeilen) {
      const tr = el('tr');
      if (z.teamId && hervorgehoben.has(z.teamId)) tr.className = 'eigen';
      else if (z.teamId && heimisch.has(z.teamId)) tr.className = 'heimisch';
      // Handball zählt Plus- und Minuspunkte („20:4“); wo das vorliegt, zeigen
      // wir es so, wie der Verband es ausweist.
      const punkte = z.punkteText ?? z.punkte;
      for (const wert of [`${z.platz}.`, z.verein, z.spiele, z.siege, z.unentschieden, z.niederlagen, z.tore, z.differenz, punkte]) {
        tr.append(el('td', null, String(wert)));
      }
      tbody.append(tr);
    }
    tabelle.append(tbody);
    rahmen.append(tabelle);
    return rahmen;
  }

  /** Grobe Rangfolge der Spielklassen, damit die höchste Liga oben steht. */
  function klassenrang(text) {
    const t = String(text ?? '').toLowerCase();
    if (t.includes('regionalliga')) return 0;
    if (t.includes('oberliga')) return 1;
    if (t.includes('landesliga')) return 2;
    if (t.includes('bezirksliga')) return 3;
    if (t.includes('kreisliga a') || /\bkl a\b/.test(t)) return 4;
    if (t.includes('kreisliga b') || /\bkl b\b/.test(t)) return 5;
    if (t.includes('kreisliga c') || /\bkl c\b/.test(t)) return 6;
    return 7;
  }

  /** Eine Karte je Liga, mit allen heimischen Vereinen darin. */
  function ligenZeichnen(ziel, mannschaften) {
    const jeStaffel = new Map();
    for (const m of mannschaften) {
      if (!m.staffelId || !tabellendaten.staffeln?.[m.staffelId]?.zeilen?.length) continue;
      if (!jeStaffel.has(m.staffelId)) jeStaffel.set(m.staffelId, []);
      jeStaffel.get(m.staffelId).push(m);
    }

    if (jeStaffel.size === 0) {
      ziel.append(el('p', 'leer', 'Für die gewählten Orte liegen keine Tabellen vor.'));
      return;
    }

    let ligen = [...jeStaffel.entries()].map(([id, teams]) => {
      const staffel = tabellendaten.staffeln[id];
      const gemerkt = einstellungen.ligaFavoriten.includes(id);
      const markiert = gemerkt || teams.some(istMeinVerein);
      return { id, staffel, teams, gemerkt, markiert, rang: klassenrang(staffel.name ?? teams[0].spielklasse) };
    }).sort((a, b) => (b.gemerkt - a.gemerkt) || (b.markiert - a.markiert) || (a.rang - b.rang)
      || String(a.staffel.name).localeCompare(String(b.staffel.name), 'de'));

    if (einstellungen.nurFavoritenTabellen) ligen = ligen.filter((l) => l.gemerkt);
    if (ligen.length === 0) {
      ziel.append(el('p', 'leer', einstellungen.nurFavoritenTabellen
        ? 'Du hast noch keine Tabelle gemerkt. Tippe auf den Stern oben rechts an einer Tabelle – oder schalte „Nur meine“ wieder aus.'
        : 'Für die gewählten Orte liegen keine Tabellen vor.'));
      return;
    }

    for (const liga of ligen) {
      const karte = el('article', 'mannschaft');
      karte.dataset.zone = liga.teams[0].zone;

      const stern = el('button', 'liga-stern');
      stern.type = 'button';
      const markiert = einstellungen.ligaFavoriten.includes(liga.id);
      stern.setAttribute('aria-pressed', String(markiert));
      stern.title = markiert ? 'Tabelle nicht mehr merken' : 'Tabelle merken';
      stern.setAttribute('aria-label', stern.title);
      stern.append(svgIkone('', STERN));
      stern.addEventListener('click', () => {
        umschalten(einstellungen.ligaFavoriten, liga.id);
        tabellenZeichnen();
      });
      karte.append(stern);

      const kopf = el('div', 'mannschaft-kopf');
      kopf.append(el('h2', null, liga.staffel.name ?? 'Liga'));
      const sportart = liga.staffel.sportart ?? sportartVonMannschaft(liga.teams[0]);
      if (sportart) kopf.append(el('span', 'marke-etikett sportmarke', sportart));
      kopf.append(el('div', 'liga-vereine', [...new Set(liga.teams.map((t) => t.verein))].join(' · ')));

      // Der beste heimische Platz als Kennzahl der Liga.
      const beste = liga.teams.filter((t) => t.platz != null).sort((a, b) => a.platz - b.platz)[0];
      if (beste) {
        const stand = el('div', 'stand');
        const kennzahl = (wert, bez) => {
          const d = el('div');
          d.append(el('span', 'wert', wert), el('span', 'bez', bez));
          return d;
        };
        stand.append(kennzahl(`${beste.platz}.`, `bester Platz · ${beste.verein.split(' ').slice(0, 2).join(' ')}`));
        stand.append(kennzahl(String(liga.staffel.zeilen.length), 'Mannschaften'));
        kopf.append(stand);
      }
      karte.append(kopf);

      const heimisch = new Set(liga.teams.map((t) => t.teamId).filter(Boolean));
      const hervorgehoben = new Set(liga.teams
        .filter((t) => einstellungen.favoriten.includes(t.verein))
        .map((t) => t.teamId).filter(Boolean));
      karte.append(ligatabelleBauen(liga.staffel.zeilen, heimisch, hervorgehoben));

      const fuss = el('div', 'mannschaft-fuss');
      fuss.append(el('span', null, `${liga.staffel.zeilen.length} Mannschaften`));
      const a = el('a', null, 'Liga bei fussball.de');
      a.href = `https://www.fussball.de/spieltag/-/staffel/${liga.id}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      fuss.append(a);
      karte.append(fuss);

      ziel.append(karte);
    }
  }

  function mannschaftBauen(m, staffel) {
    const karte = el('article', 'mannschaft');
    karte.dataset.zone = m.zone;

    const kopf = el('div', 'mannschaft-kopf');
    kopf.append(el('h2', null, m.verein));
    kopf.append(el('div', 'mannschaft-liga', [m.liga, m.ort].filter(Boolean).join(' · ')));

    const stand = el('div', 'stand');
    const kennzahl = (wert, bez) => {
      const d = el('div');
      d.append(el('span', 'wert', wert), el('span', 'bez', bez));
      return d;
    };
    if (m.platz != null) stand.append(kennzahl(`${m.platz}.`, 'Platz'));
    if (m.punkte != null) stand.append(kennzahl(String(m.punkte), 'Punkte'));
    if (m.torverhaeltnis) stand.append(kennzahl(m.torverhaeltnis, 'Tore'));
    if (stand.childElementCount) kopf.append(stand);
    karte.append(kopf);

    if (staffel?.zeilen?.length) {
      const details = el('details');
      details.open = true;   // Die Tabelle ist der Grund, warum man hier ist.
      details.append(el('summary', null, `Tabelle ${staffel.name ?? ''}`.trim()));
      const eigen = new Set(m.teamId ? [m.teamId] : []);
      details.append(ligatabelleBauen(staffel.zeilen, eigen, eigen));
      karte.append(details);
    }

    if (m.naechste?.length) {
      const details = el('details');
      details.append(el('summary', null, 'Nächste Spiele'));
      details.append(spiellisteBauen(m.naechste, m.verein));
      karte.append(details);
    }

    if (m.letzte?.length) {
      const details = el('details');
      details.append(el('summary', null, 'Zuletzt gespielt'));
      details.append(spiellisteBauen(m.letzte, m.verein));
      karte.append(details);
    }

    const fuss = el('div', 'mannschaft-fuss');
    fuss.append(el('span', null, m.mannschaft ?? ''));
    if (m.teamUrl) {
      const a = el('a', null, 'bei fussball.de öffnen');
      a.href = m.teamUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      fuss.append(a);
    }
    karte.append(fuss);

    return karte;
  }

  /** Erklärt am Fuß der Tabellenansicht, warum keine Ergebnisziffern dastehen. */
  function fussnoteAnhaengen(ziel) {
    if (!tabellendaten?.hinweisErgebnisse) return;
    const note = el('p', 'fuss-klein', tabellendaten.hinweisErgebnisse);
    note.style.marginTop = '1rem';
    ziel.append(note);
  }

  /**
   * Gehört diese Mannschaft zu einem gemerkten Verein? Beim Handball steht in
   * der Tabelle oft die Reserve („TuS Lintfort II“); `heimatverein` trägt den
   * vereinheitlichten Namen, unter dem der Verein auch in den Meldungen läuft.
   */
  const istMeinVerein = (m) => einstellungen.favoriten.includes(m.verein)
    || (m.heimatverein != null && einstellungen.favoriten.includes(m.heimatverein));

  /** Sportart einer Mannschaft – ältere Datenstände kannten nur Fußball. */
  const sportartVonMannschaft = (m) => m.sportart
    ?? tabellendaten?.staffeln?.[m.staffelId]?.sportart
    ?? 'Fußball';

  /** Reiterband über den Tabellen, sobald mehr als eine Sportart vorliegt. */
  function tabellensportZeichnen(mannschaften) {
    const behaelter = $('tabellensport');
    const zaehler = new Map();
    for (const m of mannschaften) {
      const s = sportartVonMannschaft(m);
      zaehler.set(s, (zaehler.get(s) ?? 0) + 1);
    }

    if (zaehler.size < 2) { behaelter.hidden = true; return; }
    behaelter.hidden = false;
    behaelter.replaceChildren();

    const eintraege = [['alle', 'Alle Sportarten'], ...[...zaehler.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => [name, name])];

    for (const [wert, beschriftung] of eintraege) {
      const knopf = el('button', 'chip');
      knopf.type = 'button';
      knopf.setAttribute('aria-pressed', String(tabellensport === wert));
      knopf.append(document.createTextNode(beschriftung));
      if (wert !== 'alle') knopf.append(el('span', 'zahl', String(zaehler.get(wert))));
      knopf.addEventListener('click', () => {
        tabellensport = wert;
        tabellenZeichnen();
        scrollTo({ top: 0, behavior: 'smooth' });
      });
      behaelter.append(knopf);
    }
  }

  function tabellenZeichnen() {
    const ziel = $('tabellen-ansicht');
    ziel.replaceChildren();

    if (!tabellendaten) {
      ziel.append(el('p', 'leer', 'Tabellen werden geladen …'));
      return;
    }

    tabellensportZeichnen(tabellendaten.mannschaften.filter((m) => !einstellungen.ausgeblendeteOrte.includes(m.ort)));

    const rang = { kern: 0, umland: 1, duisburg: 2 };
    const liste = [...tabellendaten.mannschaften]
      .filter((m) => !einstellungen.ausgeblendeteOrte.includes(m.ort))
      .filter((m) => tabellensport === 'alle' || sportartVonMannschaft(m) === tabellensport)
      .sort((a, b) => {
        const fa = istMeinVerein(a) ? 0 : 1;
        const fb = istMeinVerein(b) ? 0 : 1;
        return fa - fb || rang[a.zone] - rang[b.zone] || a.verein.localeCompare(b.verein, 'de');
      });

    if (liste.length === 0) {
      ziel.append(el('p', 'leer', 'Keine Mannschaften vorhanden.'));
      return;
    }

    const hinweis = $('modushinweis');
    // Der Stern-Schalter betrifft nur die Ligaansicht; die Vereinsansicht ist
    // ohnehin schon auf die eigenen Vereine begrenzt.
    $('knopf-nur-meine').hidden = tabellenmodus !== 'liga';
    $('knopf-nur-meine').setAttribute('aria-pressed', String(einstellungen.nurFavoritenTabellen));

    if (tabellenmodus === 'liga') {
      hinweis.hidden = !einstellungen.nurFavoritenTabellen;
      if (!hinweis.hidden) {
        hinweis.replaceChildren(
          document.createTextNode('★ Nur gemerkte Tabellen '),
          el('span', 'leise', '— über den Stern an einer Tabelle änderst du das.'),
        );
      }
      ligenZeichnen(ziel, liste);
      fussnoteAnhaengen(ziel);
      return;
    }

    // Vereinsansicht: ausschließlich die markierten Vereine.
    const gezeigt = liste.filter(istMeinVerein);

    hinweis.hidden = false;
    hinweis.replaceChildren(
      document.createTextNode(`★ Nur deine Vereine — ${gezeigt.length} von ${liste.length} `),
      el('span', 'leise', '— Vereine markierst du in den Einstellungen oder direkt in einer Meldung.'),
    );

    if (gezeigt.length === 0) {
      ziel.append(el('p', 'leer',
        'Du hast noch keinen Verein markiert, für den eine Tabelle vorliegt. '
        + 'Tippe in einer Meldung auf die grüne Vereinsmarke oder wähle sie in den Einstellungen unter „Meine Vereine“.'));
      return;
    }
    for (const m of gezeigt) ziel.append(mannschaftBauen(m, tabellendaten.staffeln?.[m.staffelId]));
    fussnoteAnhaengen(ziel);
  }

  async function ansichtWechseln(neu) {
    ansicht = neu;
    for (const b of $('ansicht').querySelectorAll('button')) {
      b.setAttribute('aria-selected', String(b.dataset.ansicht === neu));
    }

    const meldungen = neu === 'meldungen';
    $('liste').hidden = !meldungen;
    $('tabellen-ansicht').hidden = meldungen;
    $('untersicht').hidden = meldungen;
    if (meldungen) { $('modushinweis').hidden = true; $('tabellensport').hidden = true; }
    $('filter').hidden = !meldungen;
    $('knopf-suche').hidden = !meldungen;
    if (!meldungen) { $('suchzeile').hidden = true; $('leer').hidden = true; }

    if (meldungen) { zeichnen(); return; }

    tabellenZeichnen();
    if (tabellendaten === null) {
      try {
        const antwort = await fetch('data/tabellen.json', { cache: 'no-cache' });
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        tabellendaten = await antwort.json();
      } catch (err) {
        console.error(err);
        $('tabellen-ansicht').replaceChildren(
          el('p', 'leer', 'Die Tabellen konnten nicht geladen werden. Bist du offline?'),
        );
        return;
      }
      tabellenZeichnen();
    }
  }

  // ── Einstellungsblatt ────────────────────────────────────────────────────

  function blattOeffnen(offen) {
    $('einstellungen').hidden = !offen;
    $('schleier').hidden = !offen;
    document.body.style.overflow = offen ? 'hidden' : '';

    // Ohne inert bleibt alles hinter der Überlagerung mit der Tabulatortaste
    // erreichbar – der Fokus wandert unsichtbar in die Meldungsliste.
    for (const bereich of [document.querySelector('.kopf'), document.querySelector('main')]) {
      if (bereich) bereich.inert = offen;
    }

    if (offen) $('knopf-schliessen').focus();
    else $('knopf-einstellungen').focus();
  }

  // ── Nachladen ────────────────────────────────────────────────────────────

  /**
   * Holt data/feed.json. Wird beim Start aufgerufen, beim Zurückkehren zur App
   * und über den Knopf im Fuß.
   * @returns {Promise<boolean>} false nur, wenn beim allerersten Laden nichts ankam
   */
  async function meldungenHolen({ ansagen = false } = {}) {
    const knopf = $('knopf-neuladen');
    const beschriftung = knopf.textContent;
    if (ansagen) { knopf.disabled = true; knopf.textContent = 'Wird gesucht …'; }

    try {
      const antwort = await fetch('data/feed.json', { cache: 'no-cache' });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      const frisch = await antwort.json();

      const bekannt = new Set((daten?.artikel ?? []).map((a) => a.id));
      const neue = daten ? frisch.artikel.filter((a) => !bekannt.has(a.id)).length : 0;

      daten = frisch;
      zuletztGeholt = Date.now();

      // Vermerke zu Meldungen, die aus dem 30-Tage-Fenster gefallen sind,
      // wegwerfen – sonst wächst die Liste endlos.
      const vorhanden = new Set(frisch.artikel.map((a) => a.id));
      if (gelesen.size) {
        const gekuerzt = [...gelesen].filter((id) => vorhanden.has(id));
        if (gekuerzt.length !== gelesen.size) {
          gelesen = new Set(gekuerzt);
          einstellungen.gelesen = gekuerzt;
          sichern();
        }
      }

      if (bekannt.size) mitLesepositionZeichnen(); else zeichnen();
      einstellungslistenZeichnen();
      vereineZeichnen($('vereinssuche')?.value.trim().toLowerCase() ?? '');
      quellenZeichnen();

      if (ansagen) {
        knopf.textContent = neue === 0 ? 'Nichts Neues' : neue === 1 ? '1 neue Meldung' : `${neue} neue Meldungen`;
        $('ansage').textContent = knopf.textContent;
        setTimeout(() => { knopf.textContent = beschriftung; knopf.disabled = false; }, 2500);
      }
      return true;
    } catch (err) {
      console.error(err);
      if (ansagen) {
        knopf.textContent = 'Nicht erreichbar';
        setTimeout(() => { knopf.textContent = beschriftung; knopf.disabled = false; }, 2500);
      }
      if (daten) return true;   // der alte Stand bleibt stehen
      $('leer').hidden = false;
      $('leer').textContent = 'Die Meldungen konnten nicht geladen werden. Bist du offline?';
      return false;
    }
  }

  // ── Start ────────────────────────────────────────────────────────────────

  async function starten() {
    themaAnwenden();

    // Beide Werte werden beim Start eingefroren: „neu seit deinem letzten
    // Besuch“ soll sich während der Sitzung nicht unter der Hand verschieben.
    besuchVorher = einstellungen.letzterBesuch;
    gelesen = new Set(einstellungen.gelesen ?? []);

    $('knopf-alles-gelesen').addEventListener('click', () => {
      for (const a of daten?.artikel ?? []) gelesen.add(a.id);
      einstellungen.gelesen = [...gelesen];
      sichern();
      zeichnen();
    });

    $('knopf-thema').addEventListener('click', () => {
      const dunkelJetzt = document.documentElement.dataset.thema
        ? document.documentElement.dataset.thema === 'dunkel'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      einstellungen.thema = dunkelJetzt ? 'hell' : 'dunkel';
      sichern();
      themaAnwenden();
    });

    $('knopf-suche').addEventListener('click', () => {
      const zeile = $('suchzeile');
      zeile.hidden = !zeile.hidden;
      $('knopf-suche').setAttribute('aria-expanded', String(!zeile.hidden));
      if (!zeile.hidden) $('suche').focus();
    });

    $('suche').addEventListener('input', (e) => {
      suchtext = e.target.value.trim().toLowerCase();
      zeichnen();
    });
    $('suche-leeren').addEventListener('click', () => {
      $('suche').value = ''; suchtext = ''; zeichnen(); $('suche').focus();
    });

    for (const knopf of $('ansicht').querySelectorAll('button')) {
      knopf.addEventListener('click', () => ansichtWechseln(knopf.dataset.ansicht));
    }

    $('knopf-nur-meine').addEventListener('click', () => {
      einstellungen.nurFavoritenTabellen = !einstellungen.nurFavoritenTabellen;
      sichern();
      tabellenZeichnen();
      scrollTo({ top: 0, behavior: 'smooth' });
    });

    for (const knopf of $('tabellenmodus').querySelectorAll('button')) {
      knopf.addEventListener('click', () => {
        tabellenmodus = knopf.dataset.modus;
        for (const b of $('tabellenmodus').querySelectorAll('button')) {
          b.setAttribute('aria-checked', String(b.dataset.modus === tabellenmodus));
        }
        tabellenZeichnen();
        scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    $('knopf-einstellungen').addEventListener('click', () => blattOeffnen(true));
    $('knopf-schliessen').addEventListener('click', () => blattOeffnen(false));
    $('schleier').addEventListener('click', () => blattOeffnen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('einstellungen').hidden) blattOeffnen(false);
    });

    for (const knopf of $('sortierung').querySelectorAll('button')) {
      knopf.setAttribute('aria-checked', String(knopf.dataset.wert === einstellungen.sortierung));
      knopf.addEventListener('click', () => {
        einstellungen.sortierung = knopf.dataset.wert;
        sichern();
        for (const b of $('sortierung').querySelectorAll('button')) {
          b.setAttribute('aria-checked', String(b.dataset.wert === einstellungen.sortierung));
        }
        zeichnen();
      });
    }

    const paywall = $('schalter-paywall');
    paywall.checked = einstellungen.paywallZeigen;
    paywall.addEventListener('change', () => {
      einstellungen.paywallZeigen = paywall.checked;
      sichern();
      zeichnen();
      einstellungslistenZeichnen();
    });

    $('vereinssuche').addEventListener('input', (e) => vereineZeichnen(e.target.value.trim().toLowerCase()));

    const netzstatus = () => { $('offline-hinweis').hidden = navigator.onLine; };
    addEventListener('online', netzstatus);
    addEventListener('offline', netzstatus);
    netzstatus();

    installhilfeVorbereiten();

    $('knopf-neuladen').addEventListener('click', () => meldungenHolen({ ansagen: true }));

    // Beim Zurückkehren zur App nachsehen, ob es Neues gibt. Ohne das zeigt
    // eine App, die tagelang im Hintergrund liegt, ewig denselben Stand.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - zuletztGeholt < 5 * 60_000) return;
      meldungenHolen();
    });

    addEventListener('scroll', () => {
      $('knopf-nach-oben').hidden = scrollY < 900;
    }, { passive: true });
    $('knopf-nach-oben').addEventListener('click', () => {
      scrollTo({ top: 0, behavior: 'smooth' });
      $('knopf-suche').focus();
    });

    if (!await meldungenHolen()) return;

    // Erst jetzt, nachdem der Hinweis gezeichnet ist: Besuch vermerken.
    einstellungen.letzterBesuch = new Date().toISOString();
    sichern();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
    }
  }

  // ── Installation ─────────────────────────────────────────────────────────

  function installhilfeVorbereiten() {
    const abschnitt = $('installhilfe');
    const text = $('installtext');
    const knopf = $('knopf-install');

    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return;

    abschnitt.hidden = false;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      text.textContent = 'In Safari auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen. '
        + 'Erst danach verhält sich die Seite wie eine App und kann Mitteilungen senden.';
      return;
    }

    text.textContent = 'Lege die App auf dem Startbildschirm ab, dann startet sie ohne Browserleiste und funktioniert auch offline.';

    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      knopf.hidden = false;
      knopf.addEventListener('click', async () => {
        knopf.hidden = true;
        e.prompt();
        await e.userChoice;
      }, { once: true });
    });
  }

  starten();
})();
