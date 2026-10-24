import math, os, shutil, urllib.request, json, xml.etree.ElementTree as ET

def fetch_languages(username, token=None):
    headers = {'User-Agent': 'GitHub-Profile-Sync'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    default_langs = [
        ('JavaScript', 356975, '#f1e05a'),
        ('Python', 320500, '#3572A5'),
        ('C#', 145000, '#178600'),
        ('CSS', 63193, '#563d7c'),
        ('Others', 27839, '#8b949e')
    ]
    try:
        url = 'https://api.github.com/user/repos?per_page=100&affiliation=owner' if token else f'https://api.github.com/users/{username}/repos?per_page=100'
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            repos_data = json.loads(resp.read().decode('utf-8'))
            if isinstance(repos_data, list):
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
                    top_4 = [
                        (name, b_cnt, color_map.get(name, '#8b949e'))
                        for name, b_cnt in sorted_langs[:4]
                    ]
                    other_bytes = sum(b_cnt for _, b_cnt in sorted_langs[4:])
                    if other_bytes > 0:
                        return top_4 + [('Others', other_bytes, '#8b949e')]
                    return top_4
    except Exception:
        pass
    return default_langs

def patch_file(path, username, token=None):
    with open(path, 'r', encoding='utf-8') as f:
        svg = f.read()

    langs = fetch_languages(username, token)
    total = sum(c for _, c, _ in langs)
    cur_angle = -math.pi / 2
    paths_xml, legend_xml = [], []
    y_start, dy = 35, 30

    for i, (name, count, color) in enumerate(langs):
        fraction = count / total
        d_angle = fraction * 2 * math.pi
        a1 = cur_angle
        a2 = cur_angle + d_angle
        cur_angle = a2

        x_o1, y_o1 = 117 * math.cos(a1), 117 * math.sin(a1)
        x_o2, y_o2 = 117 * math.cos(a2), 117 * math.sin(a2)
        x_i1, y_i1 = 65 * math.cos(a1), 65 * math.sin(a1)
        x_i2, y_i2 = 65 * math.cos(a2), 65 * math.sin(a2)

        large = 1 if d_angle > math.pi else 0
        path_d = f"M{x_o1:.3f},{y_o1:.3f}A117,117,0,{large},1,{x_o2:.3f},{y_o2:.3f}L{x_i2:.3f},{y_i2:.3f}A65,65,0,{large},0,{x_i1:.3f},{y_i1:.3f}Z"
        paths_xml.append(f'<path d="{path_d}" style="fill: {color};" class="stroke-bg" stroke-width="2px"><title>{name} {count}</title><animate attributeName="fill-opacity" values="0;0.2;0.4;0.6;0.8;1;1;1" dur="3s" repeatCount="1"></animate></path>')

        ry = y_start + i * dy
        ty = ry + 11
        legend_xml.append(f'<rect x="0" y="{ry}" width="18" height="18" fill="{color}" class="stroke-bg" stroke-width="1px"><animate attributeName="fill-opacity" values="0;0.2;0.4;0.6;0.8;1;1;1" dur="3s" repeatCount="1"></animate></rect>')
        legend_xml.append(f'<text dominant-baseline="middle" x="26" y="{ty}" class="fill-fg" font-size="18px">{name}<animate attributeName="fill-opacity" values="0;0.2;0.4;0.6;0.8;1;1;1" dur="3s" repeatCount="1"></animate></text>')

    new_block = f'<g transform="translate(273, 0)">{"".join(legend_xml)}</g><g transform="translate(130, 130)">{"".join(paths_xml)}</g></g>'
    start_marker = '<g transform="translate(273, 0)">'
    end_marker = '<g><text style="font-size: 32px; font-weight: bold;"'

    s = svg.find(start_marker)
    e = svg.find(end_marker)
    if s != -1 and e != -1:
        patched = svg[:s] + new_block + svg[e:]
        try:
            ET.fromstring(patched)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(patched)
            print(f"Successfully patched and verified: {path}")
        except Exception as err:
            print(f"Validation error on {path}: {err}")
            raise err
    else:
        print(f"Markers not found in {path}")

def main():
    username = os.environ.get('USERNAME', 'Scrooge-777')
    token = os.environ.get('GITHUB_TOKEN')
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_file = os.path.join(repo_dir, 'profile-3d-contrib', 'profile-night-green.svg')
    dest_file = os.path.join(repo_dir, 'assets', 'profile-night-green.svg')

    if os.path.exists(target_file):
        patch_file(target_file, username, token)
        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
        shutil.copy(target_file, dest_file)
        print(f"Copied {target_file} to {dest_file}")
        shutil.rmtree(os.path.dirname(target_file), ignore_errors=True)
    elif os.path.exists(dest_file):
        patch_file(dest_file, username, token)

if __name__ == '__main__':
    main()
