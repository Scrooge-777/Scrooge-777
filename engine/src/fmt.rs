//! Number formatting that matches JavaScript, so the picture's text stays the same as the
//! version this engine replaced.

/// `Math.round`: halves go up (toward positive infinity), unlike Rust's `round`.
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// A number the way JavaScript prints it: no trailing `.0`, no `-0`.
pub fn num(x: f64) -> String {
    if x == 0.0 { "0".to_string() } else { format!("{x}") }
}

/// Rounded to 1 decimal place, printed without a trailing zero.
pub fn f1(n: f64) -> String {
    num(js_round(n * 10.0) / 10.0)
}

/// Rounded to 3 decimal places, printed without trailing zeros.
pub fn f3(n: f64) -> String {
    num(js_round(n * 1000.0) / 1000.0)
}

/// `Number.prototype.toFixed`: exactly `digits` decimals, exact ties rounded away from zero.
pub fn fixed(x: f64, digits: usize) -> String {
    let plain = format!("{:.*}", digits, x);
    // Rust breaks exact ties to even; JavaScript rounds them up. Spot an exact tie from the
    // exact decimal expansion and round it up ourselves.
    let long = format!("{:.*}", digits + 30, x.abs());
    let tail = &long[long.len() - 30..];
    if tail.starts_with('5') && tail[1..].bytes().all(|b| b == b'0') {
        let scale = 10f64.powi(digits as i32);
        let up = (x.abs() * scale).round() / scale;
        let text = format!("{:.*}", digits, up);
        return if x < 0.0 { format!("-{text}") } else { text };
    }
    plain
}

/// `Number.prototype.toLocaleString("en-US")` for whole numbers: 10000 becomes `10,000`.
pub fn with_commas(n: u64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

/// Escape text for XML.
pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_javascript_rounding() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(f1(3.0), "3");
        assert_eq!(f1(12.34), "12.3");
        assert_eq!(f3(0.9600000000000001), "0.96");
        assert_eq!(num(-0.0), "0");
        assert_eq!(num(0.1 + 0.2), "0.30000000000000004");
    }

    #[test]
    fn to_fixed_rounds_exact_ties_up() {
        assert_eq!(fixed(0.125, 2), "0.13");
        assert_eq!(fixed(2.5, 0), "3");
        assert_eq!(fixed(1.005, 2), "1.00");
        assert_eq!(fixed(51.25, 1), "51.3");
        assert_eq!(fixed(63.87, 2), "63.87");
    }

    #[test]
    fn commas() {
        assert_eq!(with_commas(500), "500");
        assert_eq!(with_commas(10000), "10,000");
        assert_eq!(with_commas(2500), "2,500");
        assert_eq!(with_commas(1234567), "1,234,567");
    }
}
