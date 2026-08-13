/* Anpfiff Niederrhein — Oberflächenlogik.
   Kein Framework, kein Bauschritt: die Seite lädt data/feed.json und stellt sie dar. */

(() => {
  'use strict';

  const SPEICHER = 'anpfiff:einstellungen';
  const KERNSTAEDTE = ['Moers', 'Kamp-Lintfort', 'Neukirchen-Vluyn'];

  // Voreinstellung: der Verein mit der höchsten Priorität ist schon markiert.
  const VORGABE = {
    thema: null,              // null = Systemeinstellung folgen
    sortierung: 'relevanz',
    paywallZeigen: false,     // bewusst aus, laut Wunsch – jederzeit umschaltbar
    favoriten: ['1. FC Lintfort'],
  };

  let einstellungen = laden();
  let daten = null;
  let filter = 'alle';
  let suchtext = '';

  const $ = (id) => document.getElementById(id);
  const el = (tag, klasse, text) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  };

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

  const istFavorit = (artikel) => artikel.vereine.some((v) => einstellungen.favoriten.includes(v));

  function sichtbar(artikel) {
    if (!einstellungen.paywallZeigen && artikel.paywall === true) return false;

    if (filter === 'umland' && artikel.zone !== 'umland') return false;
    if (filter === 'duisburg' && artikel.zone !== 'duisburg') return false;
    if (filter === 'favoriten' && !istFavorit(artikel)) return false;
    if (KERNSTAEDTE.includes(filter) && !artikel.orte.includes(filter)) return false;

    if (suchtext) {
      const heuhaufen = [artikel.titel, artikel.teaser, artikel.ort, artikel.sportart, artikel.quelle, ...artikel.vereine]
        .join(' ').toLowerCase();
      if (!heuhaufen.includes(suchtext)) return false;
    }
    return true;
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

  // ── Darstellung ──────────────────────────────────────────────────────────

  function chipsZeichnen() {
    const behaelter = $('filter');
    behaelter.replaceChildren();

    const merken = filter;
    const zaehlen = (wert) => {
      filter = wert;
      const n = daten.artikel.filter(sichtbar).length;
      filter = merken;
      return n;
    };

    const eintraege = [
      ['alle', 'Alle'],
      ['favoriten', '★ Meine Vereine'],
      ...KERNSTAEDTE.map((s) => [s, s]),
      ['umland', 'Umland'],
      ['duisburg', 'Duisburg'],
    ];

    for (const [wert, beschriftung] of eintraege) {
      const knopf = el('button', 'chip');
      knopf.type = 'button';
      knopf.setAttribute('aria-pressed', String(filter === wert));
      knopf.append(document.createTextNode(beschriftung));
      const n = zaehlen(wert);
      knopf.append(el('span', 'zahl', String(n)));
      knopf.addEventListener('click', () => {
        filter = wert;
        zeichnen();
        document.querySelector('main')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      behaelter.append(knopf);
    }
  }

  function karteBauen(artikel) {
    const a = el('a', 'karte');
    a.href = artikel.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.zone = artikel.zone;

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
    text.append(el('h2', null, artikel.titel));
    if (artikel.teaser) text.append(el('p', null, artikel.teaser));

    const marken = el('div', 'marken');
    // Ortsmarke nur, wenn der Ort belegt ist – nicht wenn er bloß aus dem
    // Redaktionspfad stammt. Sonst behaupten wir mehr, als wir wissen.
    if (artikel.ort && artikel.ortSicher !== false) {
      marken.append(el('span', 'marke-etikett ort', artikel.ort));
    }
    if (artikel.sportart) marken.append(el('span', 'marke-etikett', artikel.sportart));
    for (const verein of artikel.vereine.slice(0, 2)) {
      const stern = einstellungen.favoriten.includes(verein);
      marken.append(el('span', `marke-etikett ${stern ? 'stern' : 'verein'}`, stern ? `★ ${verein}` : verein));
    }
    if (artikel.paywall === true) marken.append(el('span', 'marke-etikett schloss', '🔒 Bezahlartikel'));
    if (marken.childElementCount) text.append(marken);

    const fuss = el('div', 'karte-fuss');
    fuss.append(el('span', 'quelle', artikel.quelle));
    const zeit = zeitText(artikel.datum);
    if (zeit) { fuss.append(el('span', null, '·')); fuss.append(el('span', null, zeit)); }
    text.append(fuss);

    innen.append(text);
    a.append(innen);
    return a;
  }

  function zeichnen() {
    if (!daten) return;

    chipsZeichnen();

    const treffer = daten.artikel.filter(sichtbar).sort(reihenfolge);
    const liste = $('liste');
    liste.replaceChildren(...treffer.map(karteBauen));

    const leer = $('leer');
    if (treffer.length === 0) {
      leer.hidden = false;
      const versteckt = daten.artikel.filter((x) => x.paywall === true).length;
      leer.textContent = suchtext
        ? `Keine Meldung passt zu „${suchtext}“.`
        : !einstellungen.paywallZeigen && versteckt > 0
          ? `Hier steht gerade nichts. ${versteckt} Meldungen sind ausgeblendet, weil sie hinter einer Bezahlschranke stehen — du kannst sie in den Einstellungen einblenden.`
          : 'Hier steht gerade nichts.';
    } else {
      leer.hidden = true;
    }

    const stand = Date.parse(daten.aktualisiert);
    $('stand').textContent = Number.isNaN(stand)
      ? ''
      : `${treffer.length} von ${daten.artikel.length} Meldungen · zuletzt aktualisiert ${zeitText(daten.aktualisiert)} (${datumLang.format(new Date(stand))}) · Archiv der letzten ${daten.behaltenTage} Tage`;

    const versteckt = daten.artikel.filter((x) => x.paywall === true).length;
    $('paywall-erklaerung').textContent = einstellungen.paywallZeigen
      ? `Bezahlartikel werden mitgezeigt und mit einem Schloss gekennzeichnet. Derzeit betrifft das ${versteckt} Meldungen.`
      : `Derzeit sind ${versteckt} Meldungen ausgeblendet. RP Online und NRZ stellen einen erheblichen Teil des Lokalsports hinter die Schranke — wenn dir der Feed zu dünn wird, schalte sie hier ein.`;
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
      const markiert = einstellungen.favoriten.includes(verein.name);
      zeile.setAttribute('aria-pressed', String(markiert));

      const stern = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      stern.setAttribute('viewBox', '0 0 24 24');
      stern.setAttribute('class', 'stern-ikone');
      stern.setAttribute('aria-hidden', 'true');
      const pfad = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pfad.setAttribute('d', 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z');
      stern.append(pfad);

      const name = el('span', 'vname', verein.name);
      const n = zaehler.get(verein.name) ?? 0;
      const ort = el('span', 'vort', n > 0 ? `${verein.ort} · ${n}` : verein.ort);

      zeile.append(stern, name, ort);
      zeile.addEventListener('click', () => {
        const i = einstellungen.favoriten.indexOf(verein.name);
        if (i >= 0) einstellungen.favoriten.splice(i, 1);
        else einstellungen.favoriten.push(verein.name);
        sichern();
        vereineZeichnen($('vereinssuche').value.trim().toLowerCase());
        zeichnen();
      });
      behaelter.append(zeile);
    }

    if (liste.length === 0) {
      behaelter.append(el('p', 'erklaerung', 'Kein Verein gefunden.'));
    }
  }

  function quellenZeichnen() {
    const behaelter = $('quellenliste');
    behaelter.replaceChildren();
    for (const q of daten.quellen) {
      const zeile = el('div', 'quellenzeile');
      zeile.append(el('span', null, q.name));
      const status = el('span', q.status === 'ok' ? 'status-ok' : 'status-fehler',
        q.status === 'ok' ? `${q.eintraege} Einträge` : `Fehler: ${q.fehler ?? 'unbekannt'}`);
      zeile.append(status);
      behaelter.append(zeile);
    }
  }

  // ── Einstellungsblatt ────────────────────────────────────────────────────

  function blattOeffnen(offen) {
    $('einstellungen').hidden = !offen;
    $('schleier').hidden = !offen;
    document.body.style.overflow = offen ? 'hidden' : '';
    if (offen) $('knopf-schliessen').focus();
    else $('knopf-einstellungen').focus();
  }

  // ── Start ────────────────────────────────────────────────────────────────

  async function starten() {
    themaAnwenden();

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
    });

    $('vereinssuche').addEventListener('input', (e) => vereineZeichnen(e.target.value.trim().toLowerCase()));

    const netzstatus = () => { $('offline-hinweis').hidden = navigator.onLine; };
    addEventListener('online', netzstatus);
    addEventListener('offline', netzstatus);
    netzstatus();

    installhilfeVorbereiten();

    try {
      const antwort = await fetch('data/feed.json', { cache: 'no-cache' });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      daten = await antwort.json();
    } catch (err) {
      $('leer').hidden = false;
      $('leer').textContent = 'Die Meldungen konnten nicht geladen werden. Bist du offline?';
      console.error(err);
      return;
    }

    zeichnen();
    vereineZeichnen();
    quellenZeichnen();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
    }
  }

  // ── Installation ─────────────────────────────────────────────────────────

  function installhilfeVorbereiten() {
    const abschnitt = $('installhilfe');
    const text = $('installtext');
    const knopf = $('knopf-install');

    const schonInstalliert = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (schonInstalliert) return;

    const istIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    abschnitt.hidden = false;

    if (istIOS) {
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
