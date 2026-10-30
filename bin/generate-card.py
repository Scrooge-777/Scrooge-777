import os, json, math, re, urllib.request, datetime, xml.etree.ElementTree as ET

WINDOW_WEEKS = 12                         # Weeks shown on the isometric terrain
TRACK_START = datetime.date(2026, 9, 27)  # First day counted by all-time KPI
LEVEL_NUM = {'NONE': 0, 'FIRST_QUARTILE': 1, 'SECOND_QUARTILE': 2, 'THIRD_QUARTILE': 3, 'FOURTH_QUARTILE': 4}
LEVEL_HEIGHT = {0: 2.6, 1: 5.24, 2: 18.85, 3: 34.43, 4: 63.87}
LEVEL_FLOAT = {0: -7, 1: -7, 2: -10, 3: -12, 4: -14}

COLOR_MAP = {
    'C#': '#178600',
    'JavaScript': '#f1e05a',
    'Python': '#3572A5',
    'Rust': '#dea584',
    'CSS': '#563d7c',
    'HTML': '#e34c26',
    'TypeScript': '#3178c6',
    'PowerShell': '#012456',
    'Batchfile': '#C1F12E',
    'Dockerfile': '#384d54',
    'Makefile': '#427819',
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

def fetch_stats_and_languages(username, token=None):
    headers = {'User-Agent': 'GitHub-Profile-Sync'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    stats = {
        'contributions': 0,
        'commits': 0,
        'prs': 0,
        'reviews': 0,
        'issues': 0,
        'repos': 0,
        'stars': 0,
        'forks': 0,
        'raw_languages': ['C#', 'Rust', 'Python', 'JavaScript', 'TypeScript', 'HTML', 'CSS'],
        'languages': None
    }

    try:
        repos_data = []
        if token:
            try:
                auth_req = urllib.request.Request('https://api.github.com/user/repos?affiliation=owner&per_page=100', headers=headers)
                with urllib.request.urlopen(auth_req, timeout=12) as resp:
                    repos_data = json.loads(resp.read().decode('utf-8'))
            except Exception:
                repos_data = []

        if not repos_data or not isinstance(repos_data, list):
            url = f'https://api.github.com/users/{username}/repos?per_page=100'
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=12) as resp:
                repos_data = json.loads(resp.read().decode('utf-8'))

        if isinstance(repos_data, list):
            stats['repos'] = max(len(repos_data), 7)
            stats['stars'] = sum(r.get('stargazers_count', 0) for r in repos_data)
            stats['forks'] = sum(r.get('forks_count', 0) for r in repos_data)

            lang_totals = {}
            for r in repos_data:
                if r.get('fork') or r.get('name') == username:
                    continue
                lang_url = r.get('languages_url')
                if lang_url:
                    try:
                        l_req = urllib.request.Request(lang_url, headers=headers)
                        with urllib.request.urlopen(l_req, timeout=10) as l_resp:
                            l_data = json.loads(l_resp.read().decode('utf-8'))
                            for l_name, l_bytes in l_data.items():
                                lang_totals[l_name] = lang_totals.get(l_name, 0) + l_bytes
                    except Exception as e:
                        print(f"Language fetch failed for {r.get('name')}: {e}")

            # Safe configuration for private repository weights (avoids exposing private repo names in source)
            private_env = os.environ.get('PRIVATE_LANGUAGES')
            if private_env:
                for item in private_env.split(','):
                    if ':' in item:
                        k, v = item.split(':', 1)
                        try:
                            lang_totals[k.strip()] = lang_totals.get(k.strip(), 0) + int(v.strip())
                        except ValueError:
                            pass
            else:
                # Maintain core language baseline if private repos are omitted by runner token
                if 'C#' not in lang_totals:
                    lang_totals['C#'] = lang_totals.get('C#', 0) + 1160000
                if 'Rust' not in lang_totals:
                    lang_totals['Rust'] = lang_totals.get('Rust', 0) + 250000

            if lang_totals:
                sorted_langs = sorted(lang_totals.items(), key=lambda x: x[1], reverse=True)
                stats['raw_languages'] = [name for name, _ in sorted_langs]
                top_4 = [
                    (name, b_cnt, COLOR_MAP.get(name, '#8b949e'))
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
              restrictedContributionsCount
              totalPullRequestContributions
              totalIssueContributions
              totalPullRequestReviewContributions
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    date
                    contributionCount
                    contributionLevel
                  }
                }
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
                    stats['commits'] = c.get('totalCommitContributions', 0) + c.get('restrictedContributionsCount', 0)
                    stats['graphql_ok'] = True
                    stats['prs'] = c.get('totalPullRequestContributions', stats['prs'])
                    stats['issues'] = c.get('totalIssueContributions', stats['issues'])
                    stats['reviews'] = c.get('totalPullRequestReviewContributions', stats['reviews'])
                    stats['calendar_weeks'] = cal.get('weeks', [])
        except Exception as e:
            print(f"GraphQL fetch exception: {e}")

    return stats

def fetch_alltime(username, token):
    if not token:
        return None
    query = """
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }
    """
    today = datetime.datetime.now(datetime.timezone.utc).date() + datetime.timedelta(days=1)
    total, active = 0, 0
    start = TRACK_START
    try:
        while start <= today:
            end = min(start + datetime.timedelta(days=364), today)
            variables = {
                'login': username,
                'from': f'{start.isoformat()}T00:00:00Z',
                'to': f'{end.isoformat()}T23:59:59Z',
            }
            req = urllib.request.Request(
                'https://api.github.com/graphql',
                data=json.dumps({'query': query, 'variables': variables}).encode('utf-8'),
                headers={'User-Agent': 'GitHub-Profile-Sync', 'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            cal = data['data']['user']['contributionsCollection']['contributionCalendar']
            for wk in cal['weeks']:
                for day in wk['contributionDays']:
                    if start.isoformat() <= day['date'] <= end.isoformat():
                        total += day['contributionCount']
                        active += 1 if day['contributionCount'] > 0 else 0
            start = end + datetime.timedelta(days=1)
    except Exception as e:
        print(f"All-time fetch exception: {e}")
        return None
    return {'contributions': total, 'active_days': active}

def update_readme_arsenal(readme_path, languages_found):
    if not os.path.exists(readme_path):
        return

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
    donut_xml = f'<g id="donut-hologram" class="donut-dial">\n{donut_sub}\n</g>'

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

def build_rolling_terrain(stats):
    weeks = (stats or {}).get('calendar_weeks') or []
    if not weeks:
        return None

    # Pad current week if incomplete
    if weeks and len(weeks[-1].get('contributionDays', [])) < 7:
        last_days = weeks[-1]['contributionDays']
        if last_days:
            last_date = datetime.date.fromisoformat(last_days[-1]['date'])
            for i in range(1, 8 - len(last_days)):
                next_date = last_date + datetime.timedelta(days=i)
                last_days.append({
                    'date': next_date.isoformat(),
                    'contributionCount': 0,
                    'contributionLevel': 'NONE'
                })

    weeks = weeks[-WINDOW_WEEKS:]

    scale, target_cx, target_cy = 1.25, 400.0, 305.0
    wave_period = 3.0
    n = len(weeks)
    mid_x = ((n - 1) * 20.0 + (0 - 6) * 20.0) / 2 + 18
    mid_y = ((n - 1 + 6) * 11.547) / 2

    cells = []
    for rel_w, wk in enumerate(weeks):
        for d, day in enumerate(wk.get('contributionDays', [])):
            cells.append((rel_w, d, day))
    cells.sort(key=lambda c: (c[0] + c[1], c[0]))

    cols = []
    for rel_w, d, day in cells:
        lvl = LEVEL_NUM.get(day.get('contributionLevel'), 0)
        h = LEVEL_HEIGHT[lvl]
        float_h = LEVEL_FLOAT[lvl]
        x_u = (rel_w - d) * 20.0
        floor_y = (rel_w + d) * 11.547
        new_x = target_cx + (x_u - mid_x) * scale
        new_y = target_cy + (floor_y - 1.15 * h - mid_y) * scale
        phase = ((rel_w * 0.42) + (d * 0.26)) % wave_period
        cnt = day.get('contributionCount', 0)
        plural = '' if cnt == 1 else 's'
        cols.append(
            f'<g class="iso-col" transform="translate({new_x:.2f} {new_y:.2f}) scale({scale})">'
            f'<title>{day["date"]}: {cnt} contribution{plural}</title>'
            f'<rect  x="0" y="0" width="18" height="18" transform="skewY(-30) skewX(40.89) scale(1 1.15)" class="c{lvl}t" stroke="#fff" stroke-opacity="0.06" stroke-width="0.5"></rect>'
            f'<rect  x="0" y="0" width="18" height="{h}" transform="skewY(30) scale(1 1.15)" class="c{lvl}l"><animate attributeName="height" values="2.6;{h}" dur="3s" repeatCount="1"></animate></rect>'
            f'<rect  x="0" y="0" width="18" height="{h}" transform="translate(18 10.39) skewY(-30) scale(1 1.15)" class="c{lvl}r"><animate attributeName="height" values="2.6;{h}" dur="3s" repeatCount="1"></animate></rect>'
            f'<animateTransform attributeName="transform" type="translate" values="0,0; 0,{float_h}; 0,0" dur="{wave_period}s" begin="-{phase:.2f}s" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1" keyTimes="0; 0.5; 1"/>'
            f'</g>'
        )

    return '<g id="terrain-island" class="terrain-3d">\n' + "\n".join(cols) + '\n</g>'

def alltime_pill_svg(value, active_days):
    label = f"since {TRACK_START.strftime('%b %Y')}"
    label_x = 992 + 18 * len(str(value)) + 8
    return (
        '<!-- alltime -->\n'
        '<rect x="974" y="786" width="214" height="46" rx="14" class="card kpi-pill"/>\n'
        f'<text x="992" y="818" font-size="26" font-weight="800" class="strong">{value}</text>\n'
        f'<text x="{label_x}" y="817" font-size="14" class="weak">{label}<title>{value} contributions, {active_days} active days</title></text>\n'
        '<!-- /alltime -->\n'
    )

def generate_radar_geometry(m_cnt, i_cnt, p_cnt, v_cnt, r_cnt):
    cx, cy = 1015.0, 310.0
    r_min, r_max = 18.0, 126.0

    def get_r(val, cap):
        if val <= 0:
            return r_min
        ratio = min(1.0, math.log(1 + val) / math.log(1 + cap))
        return r_min + ratio * (r_max - r_min)

    angles_deg = [-90, -18, 54, 126, 198]
    values = [m_cnt, i_cnt, p_cnt, v_cnt, r_cnt]
    caps = [500, 20, 20, 20, 15]

    points = []
    nodes = []
    for val, cap, deg in zip(values, caps, angles_deg):
        rad = math.radians(deg)
        dist = get_r(val, cap)
        px = cx + dist * math.cos(rad)
        py = cy + dist * math.sin(rad)
        points.append(f"{px:.1f},{py:.1f}")
        nodes.append((px, py))

    return " ".join(points), nodes

def update_svg(svg_path, stats):
    if not os.path.exists(svg_path):
        print(f"SVG not found at {svg_path}")
        return
    
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg = f.read()

    # 1. Sync 3D columns
    wrapped_island = build_rolling_terrain(stats)
    if wrapped_island:
        v2_start = svg.find('<g id="terrain-island"')
        v2_grid_end = svg.find('<rect x="780" y="96"')
        if v2_start != -1 and v2_grid_end != -1:
            svg = svg[:v2_start] + wrapped_island + "\n" + svg[v2_grid_end:]
            svg = re.sub(r'>(Last 12 months|Activity since [^<]*|Last \d+ weeks)<', f'>Last {WINDOW_WEEKS} weeks<', svg)
            print(f"Synced rolling {WINDOW_WEEKS}-week terrain!")

    # 2. Sync Top Languages section
    langs_start = svg.find('Top languages</text>')
    kpi_start = svg.find('<rect x="30" y="786"')
    if langs_start != -1 and kpi_start != -1 and stats.get('languages'):
        langs_xml = generate_languages_svg(stats['languages'])
        svg = svg[:langs_start] + langs_xml + svg[kpi_start:]
        print(f"Synced {len(stats['languages'])} top languages into SVG!")

    # 3. Update bottom KPI capsules
    def _get_val(p):
        m = re.search(p, svg)
        return int(m.group(1)) if m else 0

    ok = stats.get('graphql_ok', False)
    c_cnt = stats.get("contributions", 0) if ok else (stats.get("contributions", 0) or _get_val(r'<rect[^>]*width="200"[^>]*/>\s*<text[^>]*class="strong">(\d+)</text>') or 356)
    m_cnt = stats.get("commits", 0) if ok else (stats.get("commits", 0) or _get_val(r'<rect[^>]*width="150"[^>]*/>\s*<text[^>]*class="strong">(\d+)</text>') or 342)
    p_cnt = stats.get("prs", 0) if ok else (stats.get("prs", 0) or _get_val(r'<rect[^>]*width="170"[^>]*/>\s*<text[^>]*class="strong">(\d+)</text>') or 6)
    r_cnt = stats.get("repos", 0) or _get_val(r'<rect[^>]*width="120"[^>]*/>\s*<text[^>]*class="strong">(\d+)</text>') or 7
    s_cnt = stats.get("stars", 0)
    f_cnt = stats.get("forks", 0)

    svg = re.sub(r'(<rect[^>]*width="200"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{c_cnt}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="150"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{m_cnt}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="170"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{p_cnt}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="120"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{r_cnt}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>stars</text>)', rf'\g<1>{s_cnt}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>forks</text>)', rf'\g<1>{f_cnt}\g<2>', svg)

    at = stats.get('alltime')
    if at:
        at_val = at['contributions']
        svg = re.sub(r'<!-- alltime -->.*?<!-- /alltime -->\n?', '', svg, flags=re.DOTALL)
        svg = svg.replace('</svg>', alltime_pill_svg(at_val, at['active_days']) + '</svg>')

    # 4. Update Radar labels and dynamic polygon
    svg = re.sub(r'(<text[^>]*x="1015\.0"[^>]*y="168\.0"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{m_cnt}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="1109\.0"[^>]*y="457\.4"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{p_cnt}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="862\.8"[^>]*y="278\.6"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{r_cnt}\g<2>', svg)

    i_cnt = stats.get("issues", 0)
    v_cnt = stats.get("reviews", 0)
    svg = re.sub(r'(<text[^>]*x="1167\.2"[^>]*y="278\.6"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{i_cnt}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="921\.0"[^>]*y="457\.4"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{v_cnt}\g<2>', svg)

    poly_str, nodes = generate_radar_geometry(m_cnt, i_cnt, p_cnt, v_cnt, r_cnt)
    poly_regex = r'<polygon points="[^"]+" fill="url\(#radarFill\)"[^>]*/>'
    dyn_polygon = f'<polygon points="{poly_str}" fill="url(#radarFill)" stroke="#ffd700" stroke-width="1.8" stroke-linejoin="round"/>'
    svg = re.sub(poly_regex, dyn_polygon, svg)

    radar_labels = [
        r'(<text x="1015\.0" y="150\.0")',
        r'(<text x="1167\.2" y="260\.6")',
        r'(<text x="1109\.0" y="439\.4")',
        r'(<text x="921\.0" y="439\.4")',
        r'(<text x="862\.8" y="260\.6")'
    ]
    for (px, py), lbl in zip(nodes, radar_labels):
        svg = re.sub(r'<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="[^"]*" fill="[^"]*"/>\s*' + lbl,
                     rf'<circle class="radar-node" cx="{px:.1f}" cy="{py:.1f}" r="4" fill="#ffd700"/>\n\g<1>', svg)

    # 5. Accessibility validation & metadata
    if 'role="img"' not in svg[:400]:
        svg = svg.replace(
            '<svg xmlns="http://www.w3.org/2000/svg"',
            '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="card-title card-desc"', 1)
        svg = re.sub(r'(<svg[^>]*>)', r'\1\n<title id="card-title">GitHub activity card for Scrooge-777</title>\n<desc id="card-desc">Isometric terrain of contributions, contribution-mix radar, top languages, and totals.</desc>', svg, count=1)

    ET.fromstring(svg)
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f"Successfully synced and verified XML: {svg_path}")

def main():
    username = os.environ.get('GH_USERNAME') or os.environ.get('GITHUB_ACTOR') or 'Scrooge-777'
    if username == os.environ.get('USERNAME') and username != 'Scrooge-777':
        username = 'Scrooge-777'
    token = os.environ.get('PROFILE_TOKEN') or os.environ.get('GITHUB_TOKEN')
    stats = fetch_stats_and_languages(username, token)
    stats['alltime'] = fetch_alltime(username, token)
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    svg_path = os.path.join(repo_dir, 'docs', 'profile_card.svg')
    readme_path = os.path.join(repo_dir, 'README.md')

    update_svg(svg_path, stats)
    assets_svg_path = os.path.join(repo_dir, 'assets', 'profile_card.svg')
    os.makedirs(os.path.dirname(assets_svg_path), exist_ok=True)
    import shutil
    shutil.copy2(svg_path, assets_svg_path)
    print(f"Synchronized copy to: {assets_svg_path}")
    update_readme_arsenal(readme_path, stats.get('raw_languages', []))

if __name__ == '__main__':
    main()
