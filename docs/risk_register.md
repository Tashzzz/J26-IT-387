# Risk register

Likelihood and impact: L / M / H. Review at every stand-up; update the status column.

| # | Risk | Component | Likelihood | Impact | Mitigation | Owner | Status |
|---|------|-----------|-----------|--------|------------|-------|--------|
| 1 | C1 output is late, so C2–C4 have no real input | C1 | M | H | Sample files in `contracts/samples/` let C2–C4 work with dummy data; C1 sends the first real clips early | Nethmi | Open |
| 2 | Not enough repeated deliveries per bowler for a stable ICC | C1 | H | H | Present a pilot study at PP1 (2–3 bowlers, 2 conditions, ~5 deliveries); full study after PP1 | Nethmi | Open |
| 3 | 30 fps clips blur the bowling arm | C1 | H | M | Record new clips at 60 fps or higher; report fps as a condition | Nethmi | Open |
| 4 | No real injury labels for training | C3 | H | H | Use self-reported injury history or C2 threshold breaches as provisional labels, stated clearly on the slide | Rizma | Open |
| 5 | Handoff formats do not match on integration day | all | M | H | Formats agreed in `contracts/`; changes only by PR reviewed by the downstream owner | All | Open |
| 6 | Live demo fails at PP1 | all | M | H | Freeze the build on 21 Oct; each member records a backup demo video | All | Open |
| 7 | Bowler video leaks or is committed to GitHub | all | L | H | `.gitignore` blocks video files; data kept in a restricted shared folder; anonymised bowler IDs | Nethmi | Open |
| 8 | Ethics approval status questioned by the panel | all | M | M | Confirm the SLIIT ERC status before 22 Oct and keep the evidence ready | Nethmi | Open |
| 9 | Other people in frame (coach, batter) are tracked instead of the bowler | C1 | M | H | Recording protocol: only the bowler in frame; filming tip shown in the app. After PP1: multi-person detection + automatic bowler selection | Nethmi | Open |