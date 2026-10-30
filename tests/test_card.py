#!/usr/bin/env python3
"""
tests/test_card.py
Unit tests for card asset integrity and geometry.
"""
import unittest
import os
import xml.etree.ElementTree as ET

class TestCardAsset(unittest.TestCase):
    def setUp(self):
        self.root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.svg_path = os.path.join(self.root_dir, 'docs', 'profile_card.svg')

    def test_file_exists(self):
        self.assertTrue(os.path.isfile(self.svg_path), f"Asset {self.svg_path} must exist.")

    def test_xml_well_formed(self):
        tree = ET.parse(self.svg_path)
        root = tree.getroot()
        self.assertTrue(root.tag.endswith('svg'))

    def test_radar_present(self):
        with open(self.svg_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('radar-node', content)
        self.assertIn('url(#radarFill)', content)

    def test_languages_present(self):
        with open(self.svg_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('JavaScript', content)
        self.assertIn('C#', content)

if __name__ == '__main__':
    unittest.main()
