//! The koi's swimming frames packed into one horizontal strip, cropped to the fish, plus where
//! its body axis is. Replaces the Python script this engine took over from.
//!
//! The frames come straight from the vendored git-koi library (the in-place swimming cycle,
//! head to the right), doubled in size the way git-koi's own PNG export does.
use git_koi::{
    behavior::Behavior,
    coat::KoiBody,
    history::AccountSnapshot,
    koi::derive_koi_development,
    motion::frame_count,
    render::{FRAME_HEIGHT_PIXELS, FRAME_WIDTH_PIXELS, render_swim_frame},
};

use crate::{Res, scene::Sprite};

const PAD: i64 = 3;
const SCALE: usize = 2;

/// An RGBA picture, row by row.
pub struct Frame {
    pub w: usize,
    pub h: usize,
    pub rgba: Vec<u8>,
}

/// Render the swimming cycle for a total number of contributions.
pub fn render_frames(snapshot: &AccountSnapshot, total: u64) -> Res<Vec<Frame>> {
    let mut development = derive_koi_development(snapshot).map_err(|e| format!("sprite: {e}"))?;
    development.total_contributions = total;
    let (nw, nh) = (FRAME_WIDTH_PIXELS as usize, FRAME_HEIGHT_PIXELS as usize);
    Ok((0..frame_count(Behavior::Roam))
        .map(|i| {
            let native = render_swim_frame(&development, KoiBody::Asagi, Behavior::Roam, i);
            let src = native.as_rgba_bytes();
            let (w, h) = (nw * SCALE, nh * SCALE);
            let mut rgba = vec![0u8; w * h * 4];
            for y in 0..h {
                for x in 0..w {
                    let from = ((y / SCALE) * nw + x / SCALE) * 4;
                    rgba[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&src[from..from + 4]);
                }
            }
            Frame { w, h, rgba }
        })
        .collect())
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.total_cmp(b));
    let n = v.len();
    if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 }
}

/// Pack frames into one strip. The pivot is a point on the body axis 30% of the body length
/// behind the nose, which the scene steers along the route so the head leads.
pub fn pack(frames: &[Frame]) -> Res<Sprite> {
    if frames.is_empty() {
        return Err("sprite: no frames".into());
    }
    let (mut boxes, mut noses, mut axes) = (Vec::new(), Vec::new(), Vec::new());
    for f in frames {
        let visible: Vec<(i64, i64)> = (0..f.h)
            .flat_map(|y| (0..f.w).map(move |x| (x, y)))
            .filter(|&(x, y)| f.rgba[(y * f.w + x) * 4 + 3] > 0)
            .map(|(x, y)| (x as i64, y as i64))
            .collect();
        if visible.is_empty() {
            return Err("sprite: a frame is empty".into());
        }
        let xmin = visible.iter().map(|p| p.0).min().unwrap_or(0);
        let xmax = visible.iter().map(|p| p.0).max().unwrap_or(0);
        let ymin = visible.iter().map(|p| p.1).min().unwrap_or(0);
        let ymax = visible.iter().map(|p| p.1).max().unwrap_or(0);
        boxes.push((xmin, ymin, xmax, ymax));
        noses.push(xmax as f64);
        let head_from = xmax - 8.max((xmax - xmin) / 8);
        let head: Vec<f64> = visible.iter().filter(|p| p.0 > head_from).map(|p| p.1 as f64).collect();
        axes.push(head.iter().sum::<f64>() / head.len() as f64);
    }
    let x0 = boxes.iter().map(|b| b.0).min().unwrap_or(0) - PAD;
    let y0 = boxes.iter().map(|b| b.1).min().unwrap_or(0) - PAD;
    let x1 = boxes.iter().map(|b| b.2).max().unwrap_or(0) + PAD + 1;
    let y1 = boxes.iter().map(|b| b.3).max().unwrap_or(0) + PAD + 1;
    let (w, h) = ((x1 - x0) as usize, (y1 - y0) as usize);
    let n = frames.len();
    let mut strip = vec![0u8; w * n * h * 4];
    for (i, f) in frames.iter().enumerate() {
        for y in 0..h {
            for x in 0..w {
                let (sx, sy) = (x0 + x as i64, y0 + y as i64);
                if sx >= 0 && sy >= 0 && (sx as usize) < f.w && (sy as usize) < f.h {
                    let from = (sy as usize * f.w + sx as usize) * 4;
                    let to = (y * w * n + i * w + x) * 4;
                    strip[to..to + 4].copy_from_slice(&f.rgba[from..from + 4]);
                }
            }
        }
    }
    let mut png_bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, (w * n) as u32, h as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::High);
        encoder.set_filter(png::Filter::Adaptive);
        let mut writer = encoder.write_header().map_err(|e| format!("sprite: {e}"))?;
        writer.write_image_data(&strip).map_err(|e| format!("sprite: {e}"))?;
        writer.finish().map_err(|e| format!("sprite: {e}"))?;
    }
    let nose = median(noses);
    let axis = median(axes);
    let min_left = boxes.iter().map(|b| b.0).min().unwrap_or(0) as f64;
    let length = nose - min_left;
    let round1 = |x: f64| (x * 10.0).round_ties_even() / 10.0;
    Ok(Sprite {
        w: w as u32,
        h: h as u32,
        frames: n as u32,
        length: length as u32,
        pivot: [round1(nose - 0.30 * length - x0 as f64), round1(axis - y0 as f64)],
        b64: base64(&png_bytes),
    })
}

/// Standard base64 with padding.
pub fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    fn frame_with_block(x: usize, y: usize, w: usize, h: usize) -> Frame {
        let (fw, fh) = (40, 30);
        let mut rgba = vec![0u8; fw * fh * 4];
        for yy in y..y + h {
            for xx in x..x + w {
                rgba[(yy * fw + xx) * 4..(yy * fw + xx) * 4 + 4].copy_from_slice(&[200, 100, 50, 255]);
            }
        }
        Frame { w: fw, h: fh, rgba }
    }

    #[test]
    fn packs_frames_side_by_side_cropped_to_the_fish() {
        let frames = vec![frame_with_block(10, 10, 12, 6), frame_with_block(11, 11, 12, 6)];
        let s = pack(&frames).expect("packs");
        assert_eq!(s.frames, 2);
        // the union of both blocks is x 10..=22, y 10..=16, plus 3 px of padding all round
        assert_eq!((s.w, s.h), (13 + 2 * PAD as u32, 7 + 2 * PAD as u32));
        assert!(s.pivot[0] > 0.0 && s.pivot[0] < f64::from(s.w));
        assert!(!s.b64.is_empty());
    }

    #[test]
    fn an_empty_frame_is_an_error() {
        let empty = Frame { w: 4, h: 4, rgba: vec![0; 64] };
        assert!(pack(&[empty]).is_err());
    }
}
