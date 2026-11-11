# Location data for VoteWatch PNG: sources and status

Researched 18 Oct 2026. **Read the status section first.** Nothing here has been field-verified; every dataset must be
checked against the official source before activation.

## Status: what exists and what does not

| Level | Official source found | Status |
|---|---|---|
| Province (22) | **NSO 2024 National Population Census, Final Figures** (Oct 2025), Table 1 and provincial snapshots | **Included** in `public/templates/png_provinces_districts_nso2024.csv`. Names are NSO's wording. |
| District (96) | Same NSO booklet, district table in each provincial snapshot | **Included.** Extraction was cross-checked: in every province the district counts add up exactly to the province total, so none were missed. See "Known issues" below. |
| Open electorate | Electoral Boundaries Commission (EBC) report, accepted by Parliament 22 Mar 2022 | **Not separately loaded.** NSO's 96 districts match the 96 open electorates of 2022 in number, but a district is not legally the same thing as an electorate. The six new GE27 electorates (Motu-Koita, Baniara, Baining, Middle Sepik, Mendi Central, Anglimp) have **unresolved boundaries** per PNGEC evidence to Parliament's committee (The National, 12 Oct 2026), and the NSO tables do not show them as separate districts (Anglimp appears only within the existing "Anglimp/South Waghi" district). |
| LLG and ward | NSO booklet gives **totals only**: 369 LLGs and "more than 6,400" wards. **No names.** | **Not included.** Names must come from NSO's census geography / census unit register (the booklet says detailed outputs will be released progressively) or the OCHA/HDX tabular file (older, 2018: 326 LLGs, 6,112 wards). |
| Polling places | PNGEC, appointed by National Gazette notice for each election | **Not published for GE27** as far as I could find. The 2022 schedules exist as per-electorate PDFs but polling places change every election; do not reuse them as GE27 data. |

## Official sources to use

1. **OCHA / HDX "Papua New Guinea - Subnational Administrative Boundaries"** (source: PNG National Statistical Office, contributor OCHA ROAP,
   licence CC BY-IGO): https://data.humdata.org/dataset/cod-ab-png . Includes `PNG_AdminBoundaries_TabularData.xlsx` (modified 4 Apr 2023). Use its
   province / district / LLG / ward names and p-codes as the `code` column.
2. **PNG Electoral Commission** (https://www.pngec.gov.pg): polling schedules and the notices appointing polling places. 2022 examples:
   - Manus: https://pngec.gov.pg/wp-content/uploads/2022/07/3-NATEL-2022-NGI-Polling-Schedule-Gazettal-Manus.pdf (columns: Team, Ward, Polling Place, Polling Villages, Date)
   - Southern / Central: https://www.pngec.gov.pg/wp-content/uploads/2022/07/4-2022-NATEL-Southern-Polling-Schedule-Gazettal-Central.pdf
3. **National Gazette** "Appointment of Polling Places" notices (legal instrument), e.g. G725, 22 Jul 2025 (Usino Bundi by-election):
   https://rms.paclii.org/pg/other/PGGovGaz/2025/725.pdf . Cite the gazette number and date in the import's Source field.
4. **EBC 2021 report and maps** (accepted by Parliament 22 Mar 2022) for open electorate boundaries; see ANU "In brief 2024/25: PNG's 2022 Redistricting":
   https://openresearch-repository.anu.edu.au/bitstreams/f163aa34-2c4b-44b1-aab5-8efbf999be69/download

## How to load data (all in the browser)

1. Admin > Locations. Download the **provinces + districts starter**, review it, and import it as a draft (version e.g. `nso-2024-draft-1`;
   use a NEW version name if you imported an earlier starter). Source: "NSO, 2024 National Population Census Final Figures (Oct 2025), Table 1 and
   provincial snapshots".
2. Build a CSV for the next levels in a spreadsheet. Columns: `key, parent_key, type, name, code`. Keys are your own stable IDs (for example the
   OCHA p-code); `parent_key` points at the parent row's key; `code` is the official code if there is one.
   - Treat an **open electorate as type `district`** under its province. Where an open electorate does not follow a district boundary, record the
     electorate (that is what candidates stand for) and note the difference in the source field.
3. Import into the **same version name** in stages (districts, then LLGs, then wards, then polling places). Each import is checked: parents must exist,
   types must nest correctly, duplicates are rejected, re-sending is harmless.
4. Review the counts in the datasets table against the official totals. Only then press **Activate**. Scrutineers' apps only ever see the active version.
5. Polling places for GE27: when PNGEC gazettes them, import them as a **new version** that contains the full geography plus polling places
   (a version is a complete snapshot), then activate. Activation is refused once tally records exist against a different version, which protects
   recorded data from being orphaned.

## Why not just load a list from the web now?

Wrong or stale geography silently misattributes votes. The sources above are official but are either PDFs per electorate, files I could not download
from this environment, or not yet final for 2027. The import tool makes loading them fast, checked and reversible (drafts can be deleted) once you have
the files.

## Known issues in the NSO source (check before activating)

- **98 vs 96 districts.** The booklet's closing text says "98 districts", but its provincial tables list 96. This file follows the tables.
- **Two province numbering schemes** appear in the same booklet (Table 1 has Hela as 12 and Jiwaka as 13; the snapshots have them as 21 and 22), so no
  province codes are included. Do not treat either numbering as an official code.
- **Spellings kept exactly as NSO prints them**, apart from dropping a trailing " District" (Sumkar, Usino Bundi). These look like typos or variants and
  should be checked against PNGEC's spelling before activation: Ambunti/Drekikier (probably Ambunti-Dreikikir), Unggai-Benna (Unggai-Bena),
  Tawae/Siassi (Tewae-Siassi), Sina Sina Yongomugl (Sinasina-Yongomugl), Lagaip (Lagaip-Porgera), Pogera Paiela, Karimui (Karimui-Nomane),
  Koroba Kopiago (Koroba-Lake Kopiago). Fix names in the CSV before importing; keys do not need to change.
- Population figures in the booklet were used only to verify the extraction and are **not** included.

**Names reconciled with the regional lists (Southern, New Guinea Islands, Momase, Highlands).** The starter CSV and migration `010_seed_png_provinces_districts.sql` use the spellings from the PNG National Parliament / PNGEC district lists (e.g. Mendi-Munihu, Nawaeb, Tewae-Siassi, Koroba-Lake Kopiago; provinces shown as Northern / Oro, Chimbu / Simbu, Sandaun / West Sepik). Counts: 96 districts and 22 provinces (21 + 13 + 26 + 36 districts). Still verify against the official PNGEC source before real use.
