//! Builds the profile picture. Rules: `.github/rules/`, numbers: `.github/rules/rules.json`.
//!
//! One stage per module, all pure except `profile::fetch` and `pipeline`:
//! [`profile`] reads GitHub data, [`card`] draws the activity card, [`family`] and [`life`]
//! decide which koi swim and what they are doing, [`sprite`] packs the koi frames, and
//! [`scene`] bakes everything into the final SVG.

pub mod card;
pub mod family;
pub mod fmt;
pub mod life;
pub mod pipeline;
pub mod profile;
pub mod rules;
pub mod scene;
pub mod sprite;

/// Every stage reports failure as a plain message.
pub type Res<T> = Result<T, String>;
