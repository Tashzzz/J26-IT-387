# Data – not stored in this repository

Bowler videos, images and personal information are **never** committed to GitHub.
They were collected under participant consent and the SLIIT Ethics Review Committee
requirements, which need secure storage.

- Raw and processed videos: shared team folder (link posted in the Teams channel, access restricted to the team and supervisors).
- Locally, place files in `data/raw/` and `data/processed/` – both are ignored by git.

## Naming rule

```
B<bowler>_D<delivery>_<angle>_<distance>m[_<fps>fps].<ext>
e.g. B01_D03_side_10m_60fps.MOV
```

- `B01`, `B02` … are anonymised bowler codes. The code → name list is kept offline by the team leader only.
- `angle`: `front`, `semi_side`, `side`

Every clip must also have a row in `metadata.csv` (same columns as `metadata_template.csv`).
