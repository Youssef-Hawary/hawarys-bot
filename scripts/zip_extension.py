"""Packs extension/ into web/public/hawarys-bot-extension.zip so the dashboard can offer it as a download."""
import pathlib, zipfile
root = pathlib.Path(__file__).resolve().parent.parent
src, out = root / 'extension', root / 'web' / 'public' / 'hawarys-bot-extension.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob('*')):
        if f.is_file():
            z.write(f, pathlib.Path('hawarys-bot-extension') / f.relative_to(src))
print(f'wrote {out.relative_to(root)}')
