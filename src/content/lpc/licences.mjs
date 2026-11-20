/**
 * Licence rules for committed LPC art (decision 0019). A source file may be committed only if it offers one of the
 * allowed licences; we then choose the first allowed one in this order. A file whose only options are share-alike or
 * GPL is refused. Licences are read per file from the generator's CREDITS.csv.
 */
export const ALLOWED_LICENCES = Object.freeze(['CC0', 'OGA-BY 3.0+', 'OGA-BY 3.0', 'CC-BY 4.0', 'CC-BY 3.0+', 'CC-BY 3.0']);

/** The licence we use for a file offered under `offered`, or null when none is allowed. @param {readonly string[]} offered */
export function chooseLicence(offered) {
  const names = offered.map(licence => licence.trim());
  return ALLOWED_LICENCES.find(licence => names.includes(licence)) ?? null;
}

/**
 * The generator's CREDITS.csv as a map from file (relative to spritesheets/) to its credit: notes, authors, the
 * licences offered and source URLs. Fields are quoted, comma-separated and may contain commas and doubled quotes.
 * @param {string} text
 * @returns {Map<string, { notes: string, authors: string[], licences: string[], urls: string[] }>}
 */
export function parseCredits(text) {
  /** @type {string[][]} */ const rows = [];
  let row = /** @type {string[]} */ ([]), field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); if (row.some(cell => cell.trim())) rows.push(row); }
  const [header, ...body] = rows;
  if (!header || header.map(h => h.trim()).join(',') !== 'filename,notes,authors,licenses,urls') throw new Error('Unexpected CREDITS.csv header');
  const list = (/** @type {string | undefined} */ value) => (value ?? '').split(',').map(part => part.trim()).filter(Boolean);
  return new Map(body.map(cells => [(cells[0] ?? '').trim(), { notes: (cells[1] ?? '').trim(), authors: list(cells[2]), licences: list(cells[3]), urls: list(cells[4]) }]));
}

/**
 * A file's credit, as the generator lists them:
 * - its own row;
 * - for a colour variant of an animation (`…/walk/iron.png`), the row of that animation's sheet (`…/walk.png`);
 * - for a colour variant of an oversized action (`…/attack_slash/bg/iron.png`), the rows of its folder
 *   (`…/attack_slash/bg/walk.png`, `…/slash_128.png` …), but only when they all agree.
 * Otherwise null, and the file is refused.
 * @param {ReadonlyMap<string, { notes: string, authors: string[], licences: string[], urls: string[] }>} credits @param {string} file
 */
export function creditFor(credits, file) {
  const own = credits.get(file);
  if (own) return own;
  const slash = file.lastIndexOf('/');
  if (slash <= 0) return null;
  const dir = file.slice(0, slash);
  const sheet = credits.get(`${dir}.png`);
  if (sheet) return sheet;
  const siblings = [...credits].filter(([name]) => name.startsWith(`${dir}/`) && !name.slice(dir.length + 1).includes('/')).map(([, credit]) => credit);
  if (!siblings.length) return null;
  const first = JSON.stringify(siblings[0]);
  return siblings.every(credit => JSON.stringify(credit) === first) ? siblings[0] ?? null : null;
}
