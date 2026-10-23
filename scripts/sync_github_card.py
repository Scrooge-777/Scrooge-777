import os, json, math, re, urllib.request, xml.etree.ElementTree as ET

def fetch_stats_and_languages(username, token=None):
    headers = {'User-Agent': 'GitHub-Profile-Sync'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    # Baseline defaults matching Scrooge-777 verified profile
    stats = {
        'contributions': 237,
        'commits': 174,
        'prs': 3,
        'reviews': 0,
        'issues': 0,
        'repos': 4,
        'stars': 0,
        'forks': 0,
        'languages': [
            ('JavaScript', 356975, '#f1e05a'),
            ('Python', 319953, '#3572A5'),
            ('CSS', 63193, '#563d7c'),
            ('HTML', 26792, '#e34c26'),
            ('Makefile', 526, '#427819'),
            ('Batchfile', 521, '#C1F12E')
        ]
    }

    # Fetch live repos via public REST API
    try:
        req = urllib.request.Request(
            f'https://api.github.com/users/{username}/repos?per_page=100',
            headers=headers
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            repos_data = json.loads(resp.read().decode('utf-8'))
            if isinstance(repos_data, list):
                stats['repos'] = len(repos_data)
                stats['stars'] = sum(r.get('stargazers_count', 0) for r in repos_data)
                stats['forks'] = sum(r.get('forks_count', 0) for r in repos_data)

                # Aggregate languages
                lang_totals = {}
                color_map = {
                    'JavaScript': '#f1e05a',
                    'Python': '#3572A5',
                    'CSS': '#563d7c',
                    'HTML': '#e34c26',
                    'Makefile': '#427819',
                    'Batchfile': '#C1F12E',
                    'TypeScript': '#3178c6',
                    'Rust': '#dea584',
                    'C++': '#f34b7d',
                    'Go': '#00ADD8'
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
                    stats['languages'] = [
                        (name, b_cnt, color_map.get(name, '#8b949e'))
                        for name, b_cnt in sorted_langs[:6]
                    ]
    except Exception as e:
        print(f"REST fetch exception: {e}")

    # Fetch GraphQL contribution numbers if token available
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

    donut_xml = "\n".join(donut_paths)
    donut_xml += f'\n<text x="150" y="667" font-size="26" font-weight="800" text-anchor="middle" class="fg">{len(languages)}</text>'
    donut_xml += f'\n<text x="150" y="685" font-size="11" text-anchor="middle" class="weak">LANGUAGES</text>'

    legend_rows = []
    y_start = 567
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

def update_svg(svg_path, green_path, stats):
    if not os.path.exists(svg_path):
        print(f"SVG not found at {svg_path}")
        return
    
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg = f.read()

    # 1. Sync 3D columns from profile-night-green.svg if available
    if os.path.exists(green_path):
        with open(green_path, 'r', encoding='utf-8') as gf:
            green_svg = gf.read()
        first_g = green_svg.find('<g transform="translate(140 154.18)">')
        last_close = green_svg.find('</g></g><g transform="translate(980, 284.5)">')
        if first_g != -1 and last_close != -1:
            raw_grid = green_svg[first_g:last_close + 4]
            cols_processed = raw_grid.replace('stroke="none"', '')
            cols_processed = cols_processed.replace('<g transform=', '<g class="iso-col" transform=')
            for i in range(5):
                cols_processed = cols_processed.replace(
                    f'class="cont-top-{i}"',
                    f'class="c{i}t" stroke="#fff" stroke-opacity="0.05" stroke-width="0.5"'
                )
                cols_processed = cols_processed.replace(f'class="cont-left-{i}"', f'class="c{i}l"')
                cols_processed = cols_processed.replace(f'class="cont-right-{i}"', f'class="c{i}r"')

            v2_first_col = svg.find('<g class="iso-col" transform="translate(140 154.18)">')
            v2_grid_end = svg.find('<rect x="780" y="96"')
            if v2_first_col != -1 and v2_grid_end != -1:
                svg = svg[:v2_first_col] + cols_processed + '\n' + svg[v2_grid_end:]
                print("Synced 3D contribution columns from profile-night-green.svg!")

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

    # 4. Update Radar Commit & PR numbers
    svg = re.sub(r'(<text[^>]*x="1015\.0"[^>]*y="168\.0"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["commits"]}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="1109\.0"[^>]*y="457\.4"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["prs"]}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="862\.8"[^>]*y="278\.6"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["repos"]}\g<2>', svg)

    # 5. Validate XML
    ET.fromstring(svg)
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f"Successfully synced and verified XML: {svg_path}")

def main():
    username = os.environ.get('USERNAME', 'Scrooge-777')
    token = os.environ.get('GITHUB_TOKEN')
    stats = fetch_stats_and_languages(username, token)
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    svg_path = os.path.join(repo_dir, 'assets', 'github_card_v2.svg')
    green_path = os.path.join(repo_dir, 'assets', 'profile-night-green.svg')
    update_svg(svg_path, green_path, stats)

if __name__ == '__main__':
    main()
