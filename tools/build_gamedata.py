"""Build resources/game for the Oblivion Remastered save editor from the game's own data files.

    python tools/build_gamedata.py "<game>/OblivionRemastered/Content/Dev/ObvData/Data" [--no-icons]

Reads Oblivion.esm + the DLC/Altar plugins (TES4 record format) for items, spells, factions, races, classes,
birthsigns, cells, quests and globals, and pulls the inventory icons out of the BSA archives (DDS -> PNG).
"""
import io
import json
import os
import struct
import sys
import zlib

from PIL import Image

DATA_DIR = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'resources', 'game')
NO_ICONS = '--no-icons' in sys.argv
ICON_SIZE = 64

# load order the game uses (Plugins.txt); the save's own plugin list is what matters at runtime
PLUGINS = ['Oblivion.esm', 'DLCBattlehornCastle.esp', 'DLCFrostcrag.esp', 'DLCHorseArmor.esp', 'DLCMehrunesRazor.esp', 'DLCOrrery.esp',
           'DLCShiveringIsles.esp', 'DLCSpellTomes.esp', 'DLCThievesDen.esp', 'DLCVileLair.esp', 'Knights.esp', 'AltarESPMain.esp', 'AltarDeluxe.esp']
ITEM_TYPES = {'WEAP': 'weapon', 'ARMO': 'armor', 'CLOT': 'clothing', 'ALCH': 'potion', 'INGR': 'ingredient', 'BOOK': 'book', 'MISC': 'misc',
              'KEYM': 'key', 'SGST': 'sigil', 'SLGM': 'soulgem', 'LIGH': 'light', 'APPA': 'apparatus', 'AMMO': 'ammo'}
WEAPON_TYPES = ['Blade (one hand)', 'Blade (two hand)', 'Blunt (one hand)', 'Blunt (two hand)', 'Staff', 'Bow']
SPELL_TYPES = ['Spell', 'Disease', 'Power', 'Lesser Power', 'Ability', 'Poison']
SCHOOLS = ['Alteration', 'Conjuration', 'Destruction', 'Illusion', 'Mysticism', 'Restoration']


def icon_file(icon):
    return icon.replace('\\', '__').replace('.dds', '.png')


# ---------------------------------------------------------------- TES4 plugin reader
def records(d):
    pos = 0
    n = len(d)
    while pos < n:
        t = d[pos:pos + 4]
        if t == b'GRUP':
            pos += 20
            continue
        size, flags, fid, vcs = struct.unpack_from('<IIII', d, pos + 4)
        data = d[pos + 20:pos + 20 + size]
        pos += 20 + size
        if flags & 0x40000:
            data = zlib.decompress(data[4:])
        yield t.decode(), fid, flags, data


def subrecords(data):
    p = 0
    out = []
    while p + 6 <= len(data):
        st = data[p:p + 4].decode('latin1')
        sz = struct.unpack_from('<H', data, p + 4)[0]
        if st == 'XXXX':
            sz2 = struct.unpack_from('<I', data, p + 6)[0]
            p += 10
            st = data[p:p + 4].decode('latin1')
            p += 6
            out.append((st, data[p:p + sz2]))
            p += sz2
            continue
        out.append((st, data[p + 6:p + 6 + sz]))
        p += 6 + sz
    return out


def zstr(b):
    return b.split(b'\x00', 1)[0].decode('cp1252', 'replace')


def first(subs, key):
    for k, v in subs:
        if k == key:
            return v
    return None


items, spells, factions, races, classes, birthsigns, cells, quests, globs, ench = {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
player_base = {}
actors = {}
icon_paths = set()
magic_effects = {}


def plugin_of(masters, plugin, fid):
    idx = fid >> 24
    owner = masters[idx] if idx < len(masters) else plugin
    return f'{owner}|{fid & 0xFFFFFF:06x}'


def keep_english(key, name):
    """The Remaster plugins override records with localisation keys (LOC_FN_*); keep the English name seen earlier."""
    if not name.startswith('LOC_'):
        return name
    for table in (items, spells, factions, races, classes, birthsigns, cells, quests):
        prev = table.get(key)
        if prev and prev.get('n') and not prev['n'].startswith('LOC_'):
            return prev['n']
    return name


for plugin in PLUGINS:
    path = os.path.join(DATA_DIR, plugin)
    if not os.path.exists(path):
        print('missing', plugin)
        continue
    d = open(path, 'rb').read()
    masters = []
    for t, fid, flags, data in records(d):
        if t == 'TES4':
            masters = [zstr(v) for k, v in subrecords(data) if k == 'MAST']
            continue
        if t == 'MGEF':
            subs = subrecords(data)
            edid = zstr(first(subs, 'EDID') or b'')
            dat = first(subs, 'DATA')
            if dat and len(dat) >= 16:
                magic_effects[edid[:4]] = struct.unpack_from('<I', dat, 12)[0]  # DATA: flags, baseCost, assocItem, school, ...
            continue
        if t == 'NPC_' and fid == 0x7:
            # the player's base inventory: the save's ACHR inventory stores deltas against these counts
            player_base = {}
            for k, v in subrecords(data):
                if k == 'CNTO':
                    ifid, cnt = struct.unpack_from('<Ii', v)
                    player_base[plugin_of(masters, plugin, ifid)] = player_base.get(plugin_of(masters, plugin, ifid), 0) + cnt
            continue
        if t in ('NPC_', 'CREA'):
            subs = subrecords(data)
            full = first(subs, 'FULL')
            if full:
                key = plugin_of(masters, plugin, fid)
                name = zstr(full)
                if name.startswith('LOC_') and key in actors and not actors[key].startswith('LOC_'):
                    name = actors[key]
                actors[key] = name
            continue
        if t not in ITEM_TYPES and t not in ('SPEL', 'FACT', 'RACE', 'CLAS', 'BSGN', 'CELL', 'QUST', 'GLOB', 'ENCH'):
            continue
        subs = subrecords(data)
        key = plugin_of(masters, plugin, fid)
        edid = zstr(first(subs, 'EDID') or b'')
        full = first(subs, 'FULL')
        name = keep_english(key, zstr(full)) if full else ''
        if t in ITEM_TYPES:
            icon = first(subs, 'ICON')
            icon = zstr(icon).replace('/', '\\').lower() if icon else ''
            dat = first(subs, 'DATA') or b''
            it = {'k': key, 'n': name or edid, 'e': edid, 't': ITEM_TYPES[t], 'ic': icon}
            if flags & 0x20: it['del'] = 1
            try:
                if t == 'WEAP' and len(dat) >= 26:
                    wt, speed, reach, wflags, value, health, weight, dmg = struct.unpack_from('<IffIIIfH', dat)
                    it.update({'v': value, 'w': round(weight, 2), 'h': health, 'd': dmg, 'wt': WEAPON_TYPES[wt] if wt < 6 else str(wt)})
                elif t == 'ARMO' and len(dat) >= 14:
                    ar, value, health, weight = struct.unpack_from('<HIIf', dat)
                    it.update({'v': value, 'w': round(weight, 2), 'h': health, 'ar': ar / 100})
                    bmdt = first(subs, 'BMDT')
                    if bmdt: it['slots'] = struct.unpack_from('<I', bmdt)[0]
                elif t == 'CLOT' and len(dat) >= 8:
                    value, weight = struct.unpack_from('<If', dat)
                    it.update({'v': value, 'w': round(weight, 2)})
                    bmdt = first(subs, 'BMDT')
                    if bmdt: it['slots'] = struct.unpack_from('<I', bmdt)[0]
                elif t == 'AMMO' and len(dat) >= 18:
                    speed, aflags, value, weight, dmg = struct.unpack_from('<fIIfH', dat)
                    it.update({'v': value, 'w': round(weight, 2), 'd': dmg})
                elif t == 'BOOK' and len(dat) >= 10:
                    bflags, teaches, value, weight = struct.unpack_from('<BbIf', dat)
                    it.update({'v': value, 'w': round(weight, 2)})
                    if teaches >= 0: it['teach'] = teaches
                elif t in ('MISC', 'KEYM', 'SLGM') and len(dat) >= 8:
                    value, weight = struct.unpack_from('<If', dat)
                    it.update({'v': value, 'w': round(weight, 2)})
                    if t == 'SLGM':
                        soul = first(subs, 'SOUL'); slcp = first(subs, 'SLCP')
                        if slcp: it['cap'] = slcp[0]
                        if soul: it['soul'] = soul[0]
                elif t == 'ALCH' and len(dat) >= 4:
                    weight = struct.unpack_from('<f', dat)[0]
                    enit = first(subs, 'ENIT')
                    it.update({'w': round(weight, 2), 'v': struct.unpack_from('<I', enit)[0] if enit else 0})
                elif t == 'INGR' and len(dat) >= 4:
                    weight = struct.unpack_from('<f', dat)[0]
                    enit = first(subs, 'ENIT')
                    it.update({'w': round(weight, 2), 'v': struct.unpack_from('<I', enit)[0] if enit else 0})
                elif t == 'SGST' and len(dat) >= 9:
                    uses, value, weight = struct.unpack_from('<BIf', dat)
                    it.update({'v': value, 'w': round(weight, 2), 'uses': uses})
                elif t == 'LIGH' and len(dat) >= 24:
                    time, radius, color, lflags, falloff, fov, value, weight = struct.unpack_from('<iIIIffIf', dat)
                    it.update({'v': value, 'w': round(weight, 2), 'time': time})
                    if not (lflags & 0x2):  # can be carried
                        continue
                elif t == 'APPA' and len(dat) >= 13:
                    atype, value, weight, quality = struct.unpack_from('<BIff', dat)
                    it.update({'v': value, 'w': round(weight, 2)})
            except struct.error:
                pass
            enam = first(subs, 'ENAM')
            if enam: it['ench'] = plugin_of(masters, plugin, struct.unpack_from('<I', enam)[0])
            scri = first(subs, 'SCRI')
            if scri: it['scr'] = 1
            if not name and t == 'LIGH':
                continue
            items[key] = it
            if icon: icon_paths.add(icon)
        elif t == 'SPEL':
            spit = first(subs, 'SPIT')
            sp = {'k': key, 'n': name or edid, 'e': edid}
            if spit and len(spit) >= 16:
                stype, cost, level, sflags = struct.unpack_from('<IIII', spit)
                sp.update({'st': SPELL_TYPES[stype] if stype < 6 else str(stype), 'cost': cost, 'lvl': level})
            effs = [v[:4].decode('latin1') for k, v in subs if k == 'EFID']
            if effs:
                sp['fx'] = effs
                sch = magic_effects.get(effs[0])
                if sch is not None and sch < 6: sp['school'] = SCHOOLS[sch]
            spells[key] = sp
        elif t == 'FACT':
            ranks = [zstr(v) for k, v in subs if k == 'MNAM']
            prev_ranks = (factions.get(key) or {}).get('ranks') or []
            ranks = [prev_ranks[i] if r.startswith('LOC_') and i < len(prev_ranks) else r for i, r in enumerate(ranks)]
            factions[key] = {'k': key, 'n': name or edid, 'e': edid, 'ranks': ranks}
        elif t == 'RACE':
            races[key] = {'k': key, 'n': name or edid, 'e': edid}
        elif t == 'CLAS':
            classes[key] = {'k': key, 'n': name or edid, 'e': edid}
        elif t == 'BSGN':
            birthsigns[key] = {'k': key, 'n': name or edid, 'e': edid}
        elif t == 'CELL':
            if name: cells[key] = {'n': name, 'e': edid}
        elif t == 'QUST':
            if name: quests[key] = {'n': name, 'e': edid}
        elif t == 'GLOB':
            fnam = first(subs, 'FNAM'); fltv = first(subs, 'FLTV')
            globs[key] = {'e': edid, 'ty': chr(fnam[0]) if fnam else 'f', 'v': struct.unpack_from('<f', fltv)[0] if fltv else 0}
        elif t == 'ENCH':
            enit = first(subs, 'ENIT')
            e = {'n': name or edid, 'e': edid}
            if enit and len(enit) >= 12:
                etype, charge, cost, eflags = struct.unpack_from('<IIII', enit)
                e.update({'charge': charge, 'cost': cost})
            ench[key] = e

print('items', len(items), 'spells', len(spells), 'factions', len(factions), 'cells', len(cells), 'quests', len(quests), 'globals', len(globs), 'icons referenced', len(icon_paths))
print('items still with LOC_ names:', sum(1 for i in items.values() if i['n'].startswith('LOC_')))

gamedata = {
    'plugins': PLUGINS,
    'items': list(items.values()),
    'spells': list(spells.values()),
    'factions': list(factions.values()),
    'races': list(races.values()),
    'classes': list(classes.values()),
    'birthsigns': list(birthsigns.values()),
    'cells': cells,
    'quests': quests,
    'globals': globs,
    'enchantments': ench,
    'playerBase': player_base,
    'actors': actors,
}
print('player base inventory', player_base)
os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)
with open(os.path.join(OUT, 'data', 'gamedata.json'), 'w', encoding='utf-8') as f:
    json.dump(gamedata, f, ensure_ascii=False, separators=(',', ':'))
print('gamedata.json', os.path.getsize(os.path.join(OUT, 'data', 'gamedata.json')) // 1024, 'KB')

if NO_ICONS:
    sys.exit(0)


# ---------------------------------------------------------------- BSA v103 icon extraction
def bsa_files(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'BSA\x00'
    version, offset, aflags, nfold, nfiles, fnlen, filenlen, fflags = struct.unpack_from('<8I', d, 4)
    compressed_default = bool(aflags & 0x4)
    p = offset
    folders = []
    for i in range(nfold):
        h, cnt, off = struct.unpack_from('<QII', d, p); p += 16
        folders.append((cnt, off))
    files = []
    q = offset + nfold * 16  # file record blocks follow the folder records
    for cnt, off in folders:
        nl = d[q]; fname = d[q + 1:q + 1 + nl].rstrip(b'\x00').decode('cp1252', 'replace'); q += 1 + nl
        for i in range(cnt):
            h, size, foff = struct.unpack_from('<QII', d, q); q += 16
            files.append([fname, size, foff])
    names = d[q:q + filenlen].split(b'\x00')
    out = {}
    for i, (folder, size, foff) in enumerate(files):
        name = names[i].decode('cp1252', 'replace') if i < len(names) else f'file{i}'
        comp = compressed_default ^ bool(size & 0x40000000)
        size &= 0x3fffffff
        out[(folder + '\\' + name).lower()] = (d, foff, size, comp)
    return out


def read_bsa_file(entry):
    d, off, size, comp = entry
    blob = d[off:off + size]
    if comp:
        blob = zlib.decompress(blob[4:])
    return blob


archives = {}
for bsa in sorted(os.listdir(DATA_DIR)):
    low = bsa.lower()
    if low.endswith('.bsa') and ('texture' in low or low.startswith('dlc') or low.startswith('knights') or low.startswith('altar')):
        if 'voice' in low or 'sound' in low or 'mesh' in low:
            continue
        try:
            archives.update(bsa_files(os.path.join(DATA_DIR, bsa)))
        except Exception as e:
            print('skip', bsa, e)
print('bsa entries', len(archives))
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
found = 0
missing = []
for icon in sorted(icon_paths):
    e = None
    for base in ('textures\\menus\\icons\\', 'textures\\menus80\\icons\\', 'textures\\menus50\\icons\\'):
        e = archives.get((base + icon).lower())
        if e: break
    if not e:
        missing.append(icon)
        continue
    out = os.path.join(OUT, 'icons', icon_file(icon))
    if os.path.exists(out):
        found += 1
        continue
    try:
        im = Image.open(io.BytesIO(read_bsa_file(e))).convert('RGBA')
        im = im.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
        im.save(out, 'PNG', optimize=True)
        found += 1
    except Exception as ex:
        missing.append(f'{icon} ({ex})')
print('icons written', found, 'missing', len(missing))
for m in missing[:10]:
    print('  missing', m)
