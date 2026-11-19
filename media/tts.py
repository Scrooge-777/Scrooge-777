"""Generate narration MP3s for the slides and the demo video (runs in CI, needs internet)."""
import asyncio, json, pathlib, sys
import edge_tts

HERE = pathlib.Path(__file__).resolve().parent
VOICE = "en-IN-NeerjaNeural"

async def speak(text, out):
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, VOICE, rate="-4%").save(str(out))
            if out.stat().st_size > 1000:
                return
        except Exception as e:  # network hiccups
            print("retry", out.name, e, file=sys.stderr)
        await asyncio.sleep(3)
    raise SystemExit(f"TTS failed for {out}")

async def main():
    for name in ("slides", "demo"):
        out_dir = HERE / "out" / "audio" / name
        out_dir.mkdir(parents=True, exist_ok=True)
        for item in json.loads((HERE / f"{name}_narration.json").read_text()):
            await speak(item["text"], out_dir / f"{item['id']}.mp3")
            print("ok", name, item["id"])

asyncio.run(main())
