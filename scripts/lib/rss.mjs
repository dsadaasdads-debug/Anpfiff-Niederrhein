// Schlanker RSS-2.0-Parser. Bewusst ohne Fremdbibliothek: alle eingebundenen
// Feeds sind wohlgeformtes XML mit gleichbleibender Struktur, und eine
// abhängigkeitsfreie Pipeline lässt sich in fünf Jahren noch bauen.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', sbquo: '‚',
  lsquo: '‘', rsquo: '’', euro: '€', deg: '°', shy: '', middot: '·',
};

export function decodeEntities(input) {
  if (!input) return '';
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => (name in NAMED ? NAMED[name] : m));
}

function stripCdata(value) {
  const m = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : value;
}

/** Textinhalt des ersten Vorkommens von <name> im Block. */
function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return decodeEntities(stripCdata(m[1])).trim();
}

/** Textinhalte aller Vorkommen von <name> im Block. */
function tagAll(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) {
    const value = decodeEntities(stripCdata(m[1])).trim();
    if (value) out.push(value);
  }
  return out;
}

/** Wert eines Attributs aus dem ersten passenden selbstschließenden Element. */
function attr(block, name, attribute) {
  const re = new RegExp(`<${name}\\b[^>]*\\b${attribute}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function htmlZuText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

/**
 * Zerlegt einen RSS-Feed in Einträge.
 * @returns {{titel:string, link:string, datum:Date|null, beschreibung:string,
 *            rubriken:string[], bild:string, guid:string}[]}
 */
export function parseRss(xml) {
  const eintraege = [];
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;

  while ((m = re.exec(xml)) !== null) {
    const block = m[1];

    const titel = tag(block, 'title');
    const link = tag(block, 'link') || attr(block, 'link', 'href');
    if (!titel || !link) continue;

    const roh = tag(block, 'pubDate') || tag(block, 'dc:date') || tag(block, 'updated');
    const datum = roh ? new Date(roh) : null;

    const bild =
      attr(block, 'media:content', 'url') ||
      attr(block, 'media:thumbnail', 'url') ||
      (/type\s*=\s*["']image\//i.test(block) ? attr(block, 'enclosure', 'url') : '');

    // Die Funke-Titel (NRZ, WAZ) liefern den Bezahlstatus direkt im Feed mit:
    //   <dcterms:accessRights>paid</dcterms:accessRights>
    // Wo das steht, erübrigt sich der Abruf der Artikelseite komplett.
    const zugangRoh = tag(block, 'dcterms:accessRights').toLowerCase();
    const zugang = zugangRoh === 'paid' ? 'paid' : zugangRoh === 'free' ? 'free' : null;

    eintraege.push({
      titel,
      link,
      datum: datum && !Number.isNaN(datum.getTime()) ? datum : null,
      beschreibung: htmlZuText(tag(block, 'description')),
      rubriken: tagAll(block, 'category'),
      bild,
      zugang,
      guid: tag(block, 'guid') || link,
    });
  }

  return eintraege;
}
