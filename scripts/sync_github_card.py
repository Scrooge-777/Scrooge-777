import os, json, math, re, urllib.request, xml.etree.ElementTree as ET

def fetch_stats(username, token=None):
    headers = {'User-Agent': 'GitHub-Profile-Sync'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    stats = {
        'contributions': 228,
        'commits': 165,
        'prs': 3,
        'reviews': 0,
        'issues': 0,
        'repos': 4,
        'stars': 0,
        'forks': 0,
        'languages': [
            ('Python', 75, '#3572A5'),
            ('Rust', 45, '#dea584'),
            ('C++', 35, '#f34b7d'),
            ('TypeScript', 30, '#3178c6'),
            ('Go', 20, '#00ADD8'),
            ('JavaScript', 16, '#f1e05a')
        ]
    }
    
    if not token:
        return stats

    query = """
    query($login: String!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
          totalCount
          nodes {
            stargazerCount
            forkCount
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name color } }
            }
          }
        }
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
                
                repos = u.get('repositories', {})
                stats['repos'] = repos.get('totalCount', stats['repos'])
                stars = sum(r.get('stargazerCount', 0) for r in repos.get('nodes', []))
                forks = sum(r.get('forkCount', 0) for r in repos.get('nodes', []))
                stats['stars'] = stars
                stats['forks'] = forks
                print(f"Fetched live stats for {username}: {stats['contributions']} contributions, {stats['commits']} commits, {stats['prs']} PRs, {stats['repos']} repos")
    except Exception as e:
        print(f"GraphQL fetch exception: {e}")

    return stats

def update_svg(svg_path, stats):
    if not os.path.exists(svg_path):
        print(f"SVG not found at {svg_path}")
        return
    
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg = f.read()

    # Update bottom KPI capsules
    svg = re.sub(r'(<rect[^>]*width="200"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["contributions"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="150"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["commits"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="170"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["prs"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="120"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["repos"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>stars</text>)', rf'\g<1>{stats["stars"]}\g<2>', svg)
    svg = re.sub(r'(<rect[^>]*width="110"[^>]*/>\s*<text[^>]*class="strong">)\d+(</text>\s*<text[^>]*>forks</text>)', rf'\g<1>{stats["forks"]}\g<2>', svg)

    # Update Radar Commit & PR numbers
    svg = re.sub(r'(<text[^>]*x="1015\.0"[^>]*y="168\.0"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["commits"]}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="1109\.0"[^>]*y="457\.4"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["prs"]}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*x="862\.8"[^>]*y="278\.6"[^>]*class="strong">)\d+(</text>)', rf'\g<1>{stats["repos"]}\g<2>', svg)

    # Validate XML
    try:
        ET.fromstring(svg)
        with open(svg_path, 'w', encoding='utf-8') as f:
            f.write(svg)
        print(f"Successfully synced and verified XML: {svg_path}")
    except Exception as err:
        print(f"Validation error: {err}")

def main():
    username = os.environ.get('USERNAME', 'Scrooge-777')
    token = os.environ.get('GITHUB_TOKEN')
    stats = fetch_stats(username, token)
    update_svg('assets/github_card_v2.svg', stats)

if __name__ == '__main__':
    main()
