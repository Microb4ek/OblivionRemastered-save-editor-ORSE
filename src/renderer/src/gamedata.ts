/** Static game data (resources/game/data/gamedata.json) built by tools/build_gamedata.py. */

export type ItemType = 'weapon' | 'armor' | 'clothing' | 'potion' | 'ingredient' | 'book' | 'misc' | 'key' | 'sigil' | 'soulgem' | 'light' | 'apparatus' | 'ammo';

export interface GameItem {
  /** "Oblivion.esm|00000f" */
  k: string;
  /** display name */
  n: string;
  /** editor id */
  e: string;
  t: ItemType;
  /** icon path inside the BSA (textures\menus\icons\...) */
  ic: string;
  /** gold value */
  v?: number;
  /** weight */
  w?: number;
  /** max health (weapons / armor) */
  h?: number;
  /** damage */
  d?: number;
  /** weapon type label */
  wt?: string;
  /** armor rating */
  ar?: number;
  /** biped slot flags */
  slots?: number;
  /** enchantment key */
  ench?: string;
  /** skill index taught by a book */
  teach?: number;
  /** soul gem capacity / stored soul (1 petty … 5 grand) */
  cap?: number;
  soul?: number;
  uses?: number;
  time?: number;
  scr?: number;
  del?: number;
}

export interface GameSpell {
  k: string;
  n: string;
  e: string;
  st?: string;
  cost?: number;
  lvl?: number;
  fx?: string[];
  school?: string;
}

export interface GameFaction { k: string; n: string; e: string; ranks: string[] }
export interface Named { k: string; n: string; e: string }
export interface GameGlobal { e: string; ty: string; v: number }

export interface GameData {
  plugins: string[];
  items: GameItem[];
  spells: GameSpell[];
  factions: GameFaction[];
  races: Named[];
  classes: Named[];
  birthsigns: Named[];
  cells: Record<string, { n: string; e: string }>;
  quests: Record<string, { n: string; e: string }>;
  globals: Record<string, GameGlobal>;
  enchantments: Record<string, { n: string; e: string; charge?: number; cost?: number }>;
  /** the player's base-record inventory (form key → count); ACHR counts are deltas against it */
  playerBase?: Record<string, number>;
  /** NPC_ / CREA display names, for the kill counters */
  actors?: Record<string, string>;
}

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  weapon: 'Weapons', armor: 'Armor', clothing: 'Clothing', potion: 'Potions', ingredient: 'Ingredients', book: 'Books & scrolls', misc: 'Misc',
  key: 'Keys', sigil: 'Sigil stones', soulgem: 'Soul gems', light: 'Lights', apparatus: 'Apparatus', ammo: 'Arrows',
};
export const ITEM_TYPE_COLOR: Record<ItemType, string> = {
  weapon: '#d9865a', armor: '#8fa3c2', clothing: '#b98fd1', potion: '#d75f74', ingredient: '#7fbf7f', book: '#d8c27a', misc: '#9a9a9a',
  key: '#c9b26a', sigil: '#e06fd1', soulgem: '#7fd6e8', light: '#f0c96a', apparatus: '#8fd0a8', ammo: '#c8a27a',
};
export const ITEM_TYPES = Object.keys(ITEM_TYPE_LABEL) as ItemType[];
export const SPELL_LEVELS = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
export const SOUL_LEVELS = ['None', 'Petty', 'Lesser', 'Common', 'Greater', 'Grand'];
export const SCHOOL_COLOR: Record<string, string> = { Alteration: '#7fbf7f', Conjuration: '#b98fd1', Destruction: '#e06060', Illusion: '#e0a0e0', Mysticism: '#7fa8e8', Restoration: '#f0d070' };

/** "LOC_FN_DEMLightShieldCataclysm2" → "DEM Light Shield Cataclysm 2" for the few Deluxe records that only carry a localisation key. */
export function prettyName(n: string, edid?: string): string {
  if (!n.startsWith('LOC_')) return n;
  const src = (edid && !edid.startsWith('LOC_') ? edid : n.replace(/^LOC_\w+?_/, '')).replace(/^(DEM|SE\d+|MS\d+|Dark|FG|MG|TG)/, '$1 ');
  return src
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export class GameDb {
  readonly itemsByKey = new Map<string, GameItem>();
  readonly spellsByKey = new Map<string, GameSpell>();
  readonly factionsByKey = new Map<string, GameFaction>();
  readonly cellsByEdid = new Map<string, string>();
  readonly questsByEdid = new Map<string, string>();

  constructor(public readonly data: GameData) {
    for (const i of data.items) {
      i.n = prettyName(i.n, i.e);
      this.itemsByKey.set(i.k, i);
    }
    for (const s of data.spells) {
      s.n = prettyName(s.n, s.e);
      this.spellsByKey.set(s.k, s);
    }
    for (const f of data.factions) {
      f.n = prettyName(f.n, f.e);
      this.factionsByKey.set(f.k, f);
    }
    for (const c of Object.values(data.cells)) if (c.e) this.cellsByEdid.set(c.e.toLowerCase(), c.n);
    for (const q of Object.values(data.quests)) if (q.e) this.questsByEdid.set(q.e.toLowerCase(), q.n);
  }

  item(key: string | null | undefined): GameItem | undefined {
    return key ? this.itemsByKey.get(key) : undefined;
  }

  itemName(key: string | null | undefined): string {
    if (!key) return 'Empty';
    return this.itemsByKey.get(key)?.n ?? `Item ${key}`;
  }

  iconUrl(key: string | null | undefined): string | null {
    const it = this.item(key);
    return it?.ic ? `or://icons/${encodeURIComponent(it.ic.replace(/\\/g, '__').replace(/\.dds$/, '.png'))}` : null;
  }

  spell(key: string): GameSpell | undefined {
    return this.spellsByKey.get(key);
  }
  spellName(key: string): string {
    return this.spellsByKey.get(key)?.n ?? `Spell ${key}`;
  }
  faction(key: string): GameFaction | undefined {
    return this.factionsByKey.get(key);
  }
  factionName(key: string): string {
    return this.factionsByKey.get(key)?.n ?? `Faction ${key}`;
  }
  /** The save header stores the location as a localisation key ("LOC_FN_KvatchPlaza"); map it through the cell editor ids. */
  locationName(loc: string): string {
    const m = /^LOC_\w+?_(\w+)$/.exec(loc);
    if (!m) return loc;
    return this.cellsByEdid.get(m[1].toLowerCase()) ?? prettyName(loc);
  }
  actorName(key: string): string {
    const n = this.data.actors?.[key];
    return n ? prettyName(n) : key;
  }
  enchantName(key: string | undefined): string | null {
    return key ? (this.data.enchantments[key]?.n ?? null) : null;
  }
  typeColor(t: ItemType | undefined): string {
    return t ? ITEM_TYPE_COLOR[t] : '#777';
  }
  typeLabel(t: ItemType | undefined): string {
    return t ? ITEM_TYPE_LABEL[t] : 'Misc';
  }
}

export async function loadGameData(): Promise<GameDb> {
  const url = await window.api.gameDataUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load game data: ${res.status}`);
  return new GameDb((await res.json()) as GameData);
}

export function fmt(n: number | bigint): string {
  return Number(n).toLocaleString('en-US');
}
