import math, os, shutil, xml.etree.ElementTree as ET

def patch_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        svg = f.read()

    langs = [
        ('Python', 75, '#3572A5'),
        ('Rust', 45, '#dea584'),
        ('C++', 35, '#f34b7d'),
        ('TypeScript', 30, '#3178c6'),
        ('Go', 20, '#00ADD8'),
        ('JavaScript', 16, '#f1e05a')
    ]

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
    target_file = 'profile-3d-contrib/profile-night-green.svg'
    if os.path.exists(target_file):
        patch_file(target_file)
        os.makedirs('assets', exist_ok=True)
        dest_file = 'assets/profile-night-green.svg'
        shutil.copy(target_file, dest_file)
        print(f"Copied {target_file} to {dest_file}")
        shutil.rmtree('profile-3d-contrib', ignore_errors=True)
        print("Purged profile-3d-contrib/ directory")
    elif os.path.exists('assets/profile-night-green.svg'):
        patch_file('assets/profile-night-green.svg')

if __name__ == '__main__':
    main()
