# Oblivion Remastered Save Editor (ORSE)

Desktop save editor for **The Elder Scrolls IV: Oblivion Remastered** — Windows and SteamOS / Steam Deck (Linux AppImage).

Everything is edited inside the game's own `.sav` container: the UE5 GVAS wrapper, the Oodle-compressed payload and the classic Oblivion `.ess` it carries are all re-packed byte-exactly, so the save keeps its slot, name, thumbnail and play time.

## What you can edit

| Screen | Fields |
| --- | --- |
| **Character** | level (actor + header + slot details), gold, bounty, all 8 attributes, all 21 skills, permanent actor-value modifiers (racial / birthsign bonuses, extra health & magicka), save name |
| **Inventory** | every stack with the real game icons, counts, add any item from Oblivion.esm + DLC + Remaster plugins, per-instance condition, enchantment charge, captured soul, uses, equipped flag, remove items |
| **Spells** | known spells, powers, abilities and diseases; add any spell; one-click "all spells of a school" |
| **Factions** | memberships and ranks, join / leave factions |
| **World** | game time / calendar, every global variable the save tracks (quest counters, timescale…), kill counters |

A backup of the original file is written to `ORSE-backups` next to the save before every write.

## Install

Grab the latest release:

* **Windows**: `OR Save Editor-<version>-portable.exe` (no install) or the `-setup.exe` installer.
* **SteamOS / Steam Deck / Linux**: `OR-Save-Editor-<version>-x86_64.AppImage` — `chmod +x`, run it from Desktop mode. The Proton save folder (`steamapps/compatdata/2623190/pfx/.../SaveGames`) is found automatically; if Steam lives elsewhere use *Open a .sav file…*.

Close the game before editing — it caches the save list and will overwrite your changes on its next save.

## Build from source

```bash
npm ci
npm run typecheck
npm run build
npx electron-builder --win   # or --linux
```

`npm run test:parser` round-trips every save in the default folder through the whole decoder/encoder chain and fails on the first differing byte.

### Game data

`resources/game` (item / spell / faction / cell tables and the 64 px icons) is generated from the game files with

```bash
python tools/build_gamedata.py "<Oblivion Remastered>/OblivionRemastered/Content/Dev/ObvData/Data"
```

It reads the TES4 plugins directly (Oblivion.esm, the DLC .esp files, AltarESPMain.esp, AltarDeluxe.esp) and extracts the inventory icons from the BSA archives. Requires Python 3 + Pillow.

### Oodle

The save payload is Oodle Kraken compressed. `resources/wasm/ooz.wasm` is the open-source **ooz** decoder/encoder compiled to WebAssembly (WASI, zig); the compressor reproduces the game's own streams so re-saved files are byte-identical when nothing changed.

## Format notes

* Outer file: UE `GVAS` (`VAltarSaveContainer`) with one `AltarSaveData` byte array.
* The array is a sequence of `FArchive::SerializeCompressed` segments (tag `0x222222229E2A83C1`, 128 KB chunks), each one Oodle stream.
* Decoded: `u32 length` + inner `GVAS` (`VAltarSaveGame`) with `OblivionData` (the classic `.ess`, zero padded), `SaveGameDetails` (name, level, location, play time, JPEG thumbnail) and `SerializedAltarSaveDataArray` (kept verbatim).
* The `.ess` follows the UESP save-file format (v0.127 variant); the player's `NPC_` (0x7) and `ACHR` (0x14) change records hold attributes, skills, spells, factions and the inventory (counts are deltas against the base record). Unknown bytes are carried through untouched.

Fan-made tool, not affiliated with Bethesda. Game assets in `resources/game` belong to Bethesda Softworks / Virtuos.
