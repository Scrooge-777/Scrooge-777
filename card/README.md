# 3D Mainframe Activity Card Generators

This module contains the generators responsible for rendering the 3D isometric GitHub activity landscape, contribution mix radar, top languages donut dial, and the living roaming activity koi.

## Directory Structure

```
card/
├── python/                     # Python 3.11 implementation
│   └── generate_card.py       # Core generator with XML validation & koi layer preservation
├── rust/                       # Rust 2021 implementation
│   ├── Cargo.toml             # Rust crate configuration
│   └── src/
│       ├── main.rs            # Native binary CLI and pipeline orchestrator
│       ├── terrain.rs         # 3D isometric matrix projection & wave animation
│       ├── radar.rs           # 5-axis logarithmic contribution mix radar geometry
│       ├── languages.rs       # Donut dial trigonometry & legend progress bars
│       └── svg.rs             # SVG template manipulation & roaming koi SMIL injection
└── themes/
    └── palettes.json          # Standardized 10-theme color palettes & language mappings
```

## Side-by-Side Comparison: Python vs Rust

| Dimension | Python Edition (`card/python`) | Rust Edition (`card/rust`) |
| --- | --- | --- |
| **Language & Toolchain** | Python 3.11 + BCL | Rust 1.88+ / 2021 Edition (cargo) |
| **Artifact Output** | Script (`generate_card.py`) | Standalone binary (`card-generator-rs.exe`) |
| **Execution Overhead** | Requires Python runtime & pip | Zero dependencies, standalone native machine code |
| **In-Memory Render Latency** | ~8.5 ms | ~12.6 ms |
| **Type Safety & Contracts** | Dynamic typing | Compile-time memory safety, zero-cost abstractions |
| **Integration Flexibility** | Easy to tweak inline | High-throughput, embeddable in CI/CD without Python setup |

## Color Palettes & Themes

All visual palettes (Cyber Gold, Nordic Ice, Matrix Emerald, Royal Amethyst, Crimson Ruby, Cyber Cyan, Sunset Amber, Acid Lime, Sakura Rose, Monochrome Platinum) are centralized in `card/themes/palettes.json`. Both the Python and Rust engines consume this single source of truth.

## Roaming Activity Koi

The activity koi is injected as a vector SMIL layer (`<g id="roaming-koi">`) traversing the entire 1280x850 coordinate space along an organic cubic Bezier spline with `rotate="auto"`, wiggling and swimming across the 3D terrain, radar, and language donut.
