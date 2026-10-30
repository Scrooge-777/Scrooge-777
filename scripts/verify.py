#!/usr/bin/env python3
"""
scripts/verify.py
Validates docs/profile_card.svg XML well-formedness and structure.
"""
import os
import sys
import xml.etree.ElementTree as ET

def verify():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    svg_path = os.path.join(root_dir, 'docs', 'profile_card.svg')
    if not os.path.isfile(svg_path):
        print(f"ERROR: {svg_path} does not exist.")
        sys.exit(1)

    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        if not root.tag.endswith('svg'):
            print(f"ERROR: Root tag is not SVG ({root.tag})")
            sys.exit(1)
        print(f"[OK] {svg_path} is well-formed XML ({len(root)} top-level nodes).")
    except Exception as e:
        print(f"ERROR: XML parsing failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    verify()
