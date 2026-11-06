import os, sys

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
card_py = os.path.join(repo_root, 'card', 'python', 'generate_card.py')

if os.path.exists(card_py):
    import importlib.util
    spec = importlib.util.spec_from_file_location("generate_card", card_py)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["generate_card"] = mod
    spec.loader.exec_module(mod)
    if hasattr(mod, 'main'):
        mod.main()
else:
    print(f"Error: Card generator not found at {card_py}", file=sys.stderr)
    sys.exit(1)
