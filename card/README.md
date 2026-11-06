# 3D Mainframe Activity Card Generator (Rust Edition)

This crate is the high-performance native engine responsible for rendering the 3D isometric GitHub activity landscape, contribution mix radar, and top languages donut dial.

## Architecture

```
card/
├── rust/
│   ├── Cargo.toml             # Rust crate configuration (serde, regex, chrono)
│   └── src/
│       ├── main.rs            # Native binary CLI and pipeline orchestrator
│       ├── terrain.rs         # 3D isometric matrix projection & wave animation
│       ├── radar.rs           # 5-axis logarithmic contribution mix radar geometry
│       ├── languages.rs       # Donut dial trigonometry & legend progress bars
│       └── svg.rs             # SVG template manipulation & clean metric syncing
└── themes/
    └── palettes.json          # Standardized 10-theme color palettes & language mappings
```

## Compilation & Execution

```bash
cargo run --release --manifest-path card/rust/Cargo.toml
```

## Performance & Invariants

- **Execution Overhead**: Standalone native binary with no Python or pip runtime dependencies.
- **Safety**: Pure memory-safe Rust with static type checks.
- **Data**: totals, language bytes and the radar shape are currently fixed baseline values in `rust/src/main.rs`; the crate does not call the GitHub API yet.
- **Continuous Deployment**: Regenerated every 2 hours and at midnight IST by `.github/workflows/profile-3d.yml`.
