import os, json, math, re, urllib.request, xml.etree.ElementTree as ET

def fetch_stats_and_languages(username, token=None):
    headers = {'User-Agent': 'GitHub-Profile-Sync'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    stats = {
        'contributions': 241,
        'commits': 177,
        'prs': 3,
        'reviews': 0,
        'issues': 0,
        'repos': 6,
        'stars': 0,
        'forks': 0,
        'raw_languages': ['C#', 'Rust', 'Python', 'JavaScript', 'TypeScript', 'HTML', 'CSS'],
        'languages': [
            ('JavaScript', 356975, '#f1e05a'),
            ('Python', 320500, '#3572A5'),
            ('C#', 145000, '#178600'),
            ('CSS', 63193, '#563d7c'),
            ('Others', 27839, '#8b949e')
        ]
    }

    try:
        url = 'https://api.github.com/user/repos?per_page=100&affiliation=owner' if token else f'https://api.github.com/users/{username}/repos?per_page=100'
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            repos_data = json.loads(resp.read().decode('utf-8'))
            if isinstance(repos_data, list):
                stats['repos'] = len(repos_data)
                stats['stars'] = sum(r.get('stargazers_count', 0) for r in repos_data)
                stats['forks'] = sum(r.get('forks_count', 0) for r in repos_data)

                lang_totals = {}
                color_map = {
                    'JavaScript': '#f1e05a',
                    'Python': '#3572A5',
                    'C#': '#178600',
                    'Rust': '#dea584',
                    'CSS': '#563d7c',
                    'HTML': '#e34c26',
                    'TypeScript': '#3178c6',
                    'C++': '#f34b7d',
                    'C': '#555555',
                    'Go': '#00ADD8',
                    'Java': '#b07219',
                    'Kotlin': '#A97BFF',
                    'PHP': '#4F5D95',
                    'Ruby': '#701516',
                    'Swift': '#F05138',
                    'Dart': '#00B4AB'
                }
                for r in repos_data:
                    lang_url = r.get('languages_url')
                    if lang_url:
                        try:
                            l_req = urllib.request.Request(lang_url, headers=headers)
                            with urllib.request.urlopen(l_req, timeout=10) as l_resp:
                                l_data = json.loads(l_resp.read().decode('utf-8'))
                                for l_name, l_bytes in l_data.items():
                                    lang_totals[l_name] = lang_totals.get(l_name, 0) + l_bytes
                        except Exception:
                            pass
                
                if lang_totals:
                    sorted_langs = sorted(lang_totals.items(), key=lambda x: x[1], reverse=True)
                    stats['raw_languages'] = [name for name, _ in sorted_langs]
                    top_4 = [
                        (name, b_cnt, color_map.get(name, '#8b949e'))
                        for name, b_cnt in sorted_langs[:4]
                    ]
                    other_bytes = sum(b_cnt for _, b_cnt in sorted_langs[4:])
                    if other_bytes > 0:
                        stats['languages'] = top_4 + [('Others', other_bytes, '#8b949e')]
                    else:
                        stats['languages'] = top_4
    except Exception as e:
        print(f"REST fetch exception: {e}")

    if token:
        query = """
        query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              totalCommitContributions
              totalPullRequestContributions
              totalIssueContributions
              totalPullRequestReviewContributions
              contributionCalendar {
                totalContributions
              }
            }
          }
        }
        """
        try:
            req = urllib.request.Request(
                'https://api.github.com/graphql',
                data=json.dumps({'query': query, 'variables': {'login': username}}).encode('utf-8'),
                headers={**headers, 'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                u = data.get('data', {}).get('user')
                if u:
                    c = u.get('contributionsCollection', {})
                    cal = c.get('contributionCalendar', {})
                    stats['contributions'] = cal.get('totalContributions', stats['contributions'])
                    stats['commits'] = c.get('totalCommitContributions', stats['commits'])
                    stats['prs'] = c.get('totalPullRequestContributions', stats['prs'])
                    stats['issues'] = c.get('totalIssueContributions', stats['issues'])
                    stats['reviews'] = c.get('totalPullRequestReviewContributions', stats['reviews'])
        except Exception as e:
            print(f"GraphQL fetch exception: {e}")

    return stats

def update_readme_arsenal(readme_path, languages_found):
    if not os.path.exists(readme_path):
        return

    icon_map = {
        'C#': 'cs',
        'Rust': 'rust',
        'Python': 'python',
        'JavaScript': 'js',
        'TypeScript': 'ts',
        'HTML': 'html',
        'CSS': 'css',
        'C': 'c',
        'C++': 'cpp',
        'Go': 'go',
        'Java': 'java',
        'Kotlin': 'kotlin',
        'PHP': 'php',
        'Ruby': 'ruby',
        'Swift': 'swift',
        'Dart': 'dart',
        'Shell': 'bash',
        'Bash': 'bash',
        'Dockerfile': 'docker',
        'Solidity': 'solidity'
    }

    # Core languages always pinned
    core_languages = ['cs', 'rust', 'python', 'js', 'ts', 'html', 'css', 'docker', 'git']
    icons_str = ','.join(core_languages)
    with open(readme_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r'https://skillicons\.dev/icons\?i=[^&"\s]+(&theme=[^"\s]+)',
        rf'https://skillicons.dev/icons?i={icons_str}\g<1>',
        content
    )

    if new_content != content:
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated README.md Core Arsenal to: {icons_str}")

def generate_omen_hud_card(output_path):
    svg_content = """<svg width="400" height="150" viewBox="0 0 400 150" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="desc-omen">
  <title id="title-omen">omen-hud</title>
  <desc id="desc-omen">Siri/Alexa-style voice assistant HUD for Windows (OMEN laptop)</desc>
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, -apple-system, Sans-Serif; fill: #7aa2f7; }
    .description { font: 400 13px 'Segoe UI', Ubuntu, -apple-system, Sans-Serif; fill: #a9b1d6; }
    .badge { font: 600 11px 'Segoe UI', Ubuntu, -apple-system, Sans-Serif; fill: #7aa2f7; }
    .lock-text { font: 600 10px 'Segoe UI', Ubuntu, -apple-system, Sans-Serif; fill: #7982a9; }
  </style>

  <rect x="0.5" y="0.5" rx="6" height="149" width="399" fill="#1a1b26" stroke="#30363d" stroke-width="1"/>

  <!-- Title & Repo Icon -->
  <g transform="translate(25, 35)">
    <path fill="#7aa2f7" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>
    <text x="25" y="1" class="header">omen-hud</text>
    <rect x="130" y="-12" width="56" height="18" rx="9" fill="rgba(255,255,255,0.06)" stroke="#414868" stroke-width="0.8"/>
    <text x="142" y="1" class="lock-text">Private</text>
  </g>

  <!-- Description -->
  <g transform="translate(25, 62)">
    <text class="description" x="0" y="0">
      <tspan dy="1.2em" x="0">Siri/Alexa-style local voice &amp; text assistant HUD</tspan>
      <tspan dy="1.35em" x="0">for Windows (OMEN laptop) with on-device LLM.</tspan>
    </text>
  </g>

  <!-- Language Badge -->
  <g transform="translate(25, 125)">
    <circle cx="6" cy="-4" r="5.5" fill="#178600" />
    <text class="badge" x="18" y="0">C#</text>
    <text class="lock-text" x="48" y="0">· WPF · .NET 8</text>
  </g>
</svg>"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f"Generated {output_path}")

def generate_languages_svg(languages):
    total_bytes = sum(b for _, b, _ in languages)
    if total_bytes == 0:
        return ""

    cx, cy = 150.0, 663.0
    R, r = 90.0, 52.0
    donut_paths = []
    cur_angle = -math.pi / 2

    for name, bytes_cnt, color in languages:
        frac = bytes_cnt / total_bytes
        d_angle = frac * 2 * math.pi
        a1 = cur_angle
        a2 = cur_angle + d_angle
        cur_angle = a2

        x_o1 = cx + R * math.cos(a1)
        y_o1 = cy + R * math.sin(a1)
        x_o2 = cx + R * math.cos(a2)
        y_o2 = cy + R * math.sin(a2)

        x_i1 = cx + r * math.cos(a1)
        y_i1 = cy + r * math.sin(a1)
        x_i2 = cx + r * math.cos(a2)
        y_i2 = cy + r * math.sin(a2)

        large = 1 if d_angle > math.pi else 0
        d = f"M{x_o1:.2f},{y_o1:.2f}A{R:.0f},{R:.0f},0,{large},1,{x_o2:.2f},{y_o2:.2f}L{x_i2:.2f},{y_i2:.2f}A{r:.0f},{r:.0f},0,{large},0,{x_i1:.2f},{y_i1:.2f}Z"
        size_str = f"{bytes_cnt/1024:.1f} KB" if bytes_cnt > 1024 else f"{bytes_cnt} B"

        donut_paths.append(
            f'<path d="{d}" class="donut-slice" fill="{color}" stroke="none">'
            f'<title>{name} {size_str}</title>'
            f'<animate attributeName="fill-opacity" values="0;1" dur="1.2s" fill="freeze"/></path>'
        )

    donut_sub = "\n".join(donut_paths)
    center_metric = f"""  <!-- Donut Center Metric (Step 4 Upgrade) -->
  <circle cx="{cx:.1f}" cy="{cy:.1f}" r="44" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1" stroke-dasharray="3 3"/>
  <g class="donut-center" text-anchor="middle">
    <text x="{cx:.1f}" y="{cy - 4:.1f}" font-size="22" font-weight="800" fill="#ffffff">{len(languages)}</text>
    <text x="{cx:.1f}" y="{cy + 15:.1f}" font-size="10" font-weight="700" fill="#8b949e" letter-spacing="1.5">LANGUAGES</text>
  </g>"""
    donut_xml = f'<g id="donut-hologram" class="donut-dial">\n{donut_sub}\n{center_metric}\n</g>'

    legend_rows = []
    y_start = 572
    for i, (name, bytes_cnt, color) in enumerate(languages):
        pct = (bytes_cnt / total_bytes) * 100
        pct_str = f"{pct:.1f}%" if pct < 1 else f"{round(pct)}%"
        bar_w = max(2, round(132 * (bytes_cnt / total_bytes)))
        y_box = y_start + i * 30
        y_text = y_box + 11
        y_bar = y_box + 17

        legend_rows.append(f'<rect x="270" y="{y_box}" width="13" height="13" rx="3" fill="{color}"/>')
        legend_rows.append(f'<text x="292" y="{y_text}" font-size="14" class="fg">{name}</text>')
        legend_rows.append(f'<text x="424" y="{y_text}" font-size="14" font-weight="700" text-anchor="end" class="weak">{pct_str}</text>')
        legend_rows.append(f'<rect x="292" y="{y_bar}" width="132" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.08"/>')
        legend_rows.append(f'<rect x="292" y="{y_bar}" width="{bar_w}" height="3" rx="1.5" fill="{color}"/>')

    legend_xml = "\n".join(legend_rows)
    return f'Top languages</text>\n{donut_xml}\n{legend_xml}\n'

def build_active_wave_terrain(green_svg):
    first_g = green_svg.find('<g transform="translate(140 154.18)">')
    last_close = green_svg.find('</g></g><g transform="translate(980, 284.5)">')
    if first_g == -1 or last_close == -1:
        return None

    raw_grid = green_svg[first_g:last_close + 4]
    col_pattern = re.compile(r'<g transform="translate\(([^)]+)\)">(.*?)</g>', re.DOTALL)
    matches = list(col_pattern.finditer(raw_grid))
    if not matches:
        return None

    # Inception week: week 49 (late Sept / Oct 1st, 2026 onwards)
    start_week = 49
    start_idx = start_week * 7
    active_matches = matches[start_idx:] if len(matches) > start_idx else matches

    coords = [list(map(float, m.group(1).split())) for m in active_matches]
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    raw_cx = (min(xs) + max(xs)) / 2.0
    raw_cy = (min(ys) + max(ys)) / 2.0

    target_cx = 390.0
    target_cy = 280.0
    scale = 1.6
    wave_period = 3.0

    processed_cols = []
    for i, m in enumerate(active_matches):
        global_idx = start_idx + i
        w = global_idx // 7
        d = global_idx % 7
        rel_w = w - start_week

        orig_x, orig_y = coords[i]
        new_x = target_cx + (orig_x - raw_cx) * scale
        new_y = target_cy + (orig_y - raw_cy) * scale

        content = m.group(2)
        content = re.sub(r'<animateTransform[^>]*repeatCount="1"[^>]*>.*?</animateTransform>', '', content)
        content = re.sub(r'<animateTransform[^>]*repeatCount="1"[^>]*/>', '', content)
        content = content.replace('stroke="none"', '')

        for lvl in range(5):
            content = content.replace(
                f'class="cont-top-{lvl}"',
                f'class="c{lvl}t" stroke="#fff" stroke-opacity="0.06" stroke-width="0.5"'
            )
            content = content.replace(f'class="cont-left-{lvl}"', f'class="c{lvl}l"')
            content = content.replace(f'class="cont-right-{lvl}"', f'class="c{lvl}r"')

        float_h = -14 if "c4t" in content else (-12 if "c3t" in content else (-10 if "c2t" in content else -7))
        phase = ((rel_w * 0.42) + (d * 0.26)) % wave_period

        wave_anim = (
            f'<animateTransform attributeName="transform" type="translate" '
            f'values="0,0; 0,{float_h}; 0,0" dur="{wave_period}s" begin="-{phase:.2f}s" '
            f'repeatCount="indefinite" additive="sum" calcMode="spline" '
            f'keySplines="0.45 0 0.55 1; 0.45 0 0.55 1" keyTimes="0; 0.5; 1"/>'
        )

        col_xml = f'<g class="iso-col" transform="translate({new_x:.2f} {new_y:.2f}) scale({scale})">{content}{wave_anim}</g>'
        processed_cols.append(col_xml)

    all_cols_xml = "\n".join(processed_cols)
    wrapped = f'<g id="terrain-island" class="terrain-3d">\n{all_cols_xml}\n</g>'
    return wrapped

def generate_matrix_grid_svg():
    cx, cy = 390.0, 305.0
    dx = 32.0
    dy = 18.48
    u_min, u_max = -6, 6
    v_min, v_max = -5, 5

    lines = []
    for u in range(u_min, u_max + 1):
        x1 = cx + (u + v_min) * dx
        y1 = cy + (v_min - u) * dy
        x2 = cx + (u + v_max) * dx
        y2 = cy + (v_max - u) * dy
        lines.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')

    for v in range(v_min, v_max + 1):
        x1 = cx + (u_min + v) * dx
        y1 = cy + (v - u_min) * dy
        x2 = cx + (u_max + v) * dx
        y2 = cy + (v - u_max) * dy
        lines.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')

    grid_lines_xml = "\n    ".join(lines)

    accents = []
    corners = [
        (cx + (u_min + v_min) * dx, cy + (v_min - u_min) * dy),
        (cx + (u_max + v_min) * dx, cy + (v_min - u_max) * dy),
        (cx + (u_min + v_max) * dx, cy + (v_max - u_min) * dy),
        (cx + (u_max + v_max) * dx, cy + (v_max - u_max) * dy),
    ]
    for x, y in corners:
        accents.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#57da69" fill-opacity="0.8"/>')
        accents.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="none" stroke="#57da69" stroke-width="1" stroke-opacity="0.5"/>')
        accents.append(f'<line x1="{x-8:.1f}" y1="{y:.1f}" x2="{x+8:.1f}" y2="{y:.1f}" stroke="#57da69" stroke-width="1.2" stroke-opacity="0.8"/>')
        accents.append(f'<line x1="{x:.1f}" y1="{y-8:.1f}" x2="{x:.1f}" y2="{y+8:.1f}" stroke="#57da69" stroke-width="1.2" stroke-opacity="0.8"/>')

    accents_xml = "\n    ".join(accents)

    return f"""<!-- Isometric Matrix Grid Floor (Step 2 Upgrade) -->
<g id="iso-matrix-grid" class="matrix-grid">
  <defs>
    <radialGradient id="matrixGlow" cx="{cx:.1f}" cy="{cy:.1f}" r="280" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#57da69" stop-opacity="0.25"/>
      <stop offset="60%" stop-color="#2ea043" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#0b0e14" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gridFade" x1="100" y1="120" x2="680" y2="490" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2ea043" stop-opacity="0.30"/>
      <stop offset="50%" stop-color="#57da69" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#2ea043" stop-opacity="0.30"/>
    </linearGradient>
  </defs>
  <ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="290" ry="155" fill="url(#matrixGlow)"/>
  <g stroke="url(#gridFade)" stroke-width="1.2" stroke-opacity="0.85">
    {grid_lines_xml}
  </g>
  <g>
    {accents_xml}
  </g>
</g>"""

def update_svg(svg_path, green_path, stats):
    if not os.path.exists(svg_path):
        print(f"SVG not found at {svg_path}")
        return
    
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg = f.read()

    # Revert HUD marker if present
    svg = re.sub(r'(\.hud-marker\{.*?\n|100%\{transform:translate\(388px,108px\)\}\}\n?)', '', svg)
    svg = re.sub(r'<!-- HUD Peak Activity Marker -->\s*<g class="hud-marker".*?</g>\s*</g>\s*', '', svg, flags=re.DOTALL)

    # Revert grid floor if present
    start_grid = svg.find('<!-- Isometric Matrix Grid Floor')
    if start_grid == -1:
        start_grid = svg.find('<g id="iso-matrix-grid"')
    end_grid = svg.find('<g id="terrain-island"')
    if start_grid != -1 and end_grid != -1:
        svg = svg[:start_grid] + svg[end_grid:]

    # 1. Sync 3D columns
    if os.path.exists(green_path):
        with open(green_path, 'r', encoding='utf-8') as gf:
            green_svg = gf.read()
        wrapped_island = build_active_wave_terrain(green_svg)
        if wrapped_island:
            v2_start = svg.find('<g id="terrain-island"')
            if v2_start == -1:
                v2_start = svg.find('<g class="iso-col"')
            v2_grid_end = svg.find('<rect x="780" y="96"')

            if v2_start != -1 and v2_grid_end != -1:
                svg = svg[:v2_start] + wrapped_island + "\n" + svg[v2_grid_end:]
                svg = re.sub(r'>Last 12 months<', '>Activity since Oct 2026<', svg)
                print("Synced active 3D wave columns!")

    # 2. Sync Top Languages section
    langs_start = svg.find('Top languages</text>')
    kpi_start = svg.find('<rect x="30" y="786"')
    if langs_start != -1 and kpi_start != -1 and stats.get('languages'):
        langs_xml = generate_languages_svg(stats['languages'])
        svg = svg[:langs_start] + langs_xml + svg[kpi_start:]
        print(f"Synced {len(stats['languages'])} top languages into SVG!")

    # 3. Update bottom KPI capsules
    svg = re.sub(r'(<rect[^>]*width="200"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["contributions"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="150"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["commits"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="170"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["prs"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="120"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["repos"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>stars</text>)', rf'\g<1>{stats["stars"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>forks</text>)', rf'\g<1>{stats["forks"]}\g<2>', svg)

    # 4. Update Radar Commit & PR numbers (reverted to original baseline)
    svg = re.sub(r'(<text[^>]*x="1015\.0"[^>]*y="168\.0"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["commits"]}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="1109\.0"[^>]*y="457\.4"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["prs"]}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="862\.8"[^>]*y="278\.6"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["repos"]}\g<2>', svg)

    poly_regex = r'<polygon points="[^"]+" fill="url\(#radarFill\)"[^>]*/>'
    orig_polygon = '<polygon points="1015.0,226.3 1034.8,303.6 1037.6,341.1 1002.8,326.8 975.4,297.1" fill="url(#radarFill)" stroke="#2ea043" stroke-width="1.8" stroke-linejoin="round"/>'
    svg = re.sub(poly_regex, orig_polygon, svg)

    svg = re.sub(r'<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="[^"]*" fill="[^"]*"/>\s*(<text x="1015\.0" y="150\.0")',
                 r'<circle class="radar-node" cx="1015.0" cy="226.3" r="4" fill="#2ea043"/>\n\g<1>', svg)
    svg = re.sub(r'<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="[^"]*" fill="[^"]*"/>\s*(<text x="1167\.2" y="260\.6")',
                 r'<circle class="radar-node" cx="1034.8" cy="303.6" r="4" fill="#2ea043"/>\n\g<1>', svg)
    svg = re.sub(r'<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="[^"]*" fill="[^"]*"/>\s*(<text x="1109\.0" y="439\.4")',
                 r'<circle class="radar-node" cx="1037.6" cy="341.1" r="4" fill="#2ea043"/>\n\g<1>', svg)
    svg = re.sub(r'<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="[^"]*" fill="[^"]*"/>\s*(<text x="921\.0" y="439\.4")',
                 r'<circle class="radar-node" cx="1002.8" cy="326.8" r="4" fill="#2ea043"/>\n\g<1>', svg)
    svg = re.sub(r'<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="[^"]*" fill="[^"]*"/>\s*(<text x="862\.8" y="260\.6")',
                 r'<circle class="radar-node" cx="975.4" cy="297.1" r="4" fill="#2ea043"/>\n\g<1>', svg)

    # 5. Validate XML
    ET.fromstring(svg)
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f"Successfully synced and verified XML: {svg_path}")

def main():
    username = os.environ.get('GH_USERNAME') or os.environ.get('GITHUB_ACTOR') or 'Scrooge-777'
    if username == os.environ.get('USERNAME') and username != 'Scrooge-777':
        username = 'Scrooge-777'
    token = os.environ.get('GITHUB_TOKEN')
    stats = fetch_stats_and_languages(username, token)
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    svg_path = os.path.join(repo_dir, 'assets', 'github_card_v2.svg')
    green_path = os.path.join(repo_dir, 'assets', 'profile-night-green.svg')
    readme_path = os.path.join(repo_dir, 'README.md')
    omen_card_path = os.path.join(repo_dir, 'assets', 'omen_hud_card.svg')

    update_svg(svg_path, green_path, stats)
    generate_omen_hud_card(omen_card_path)
    update_readme_arsenal(readme_path, stats.get('raw_languages', []))

if __name__ == '__main__':
    main()
