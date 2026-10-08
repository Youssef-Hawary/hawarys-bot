"""Builds the Windows app (used by .github/workflows/windows-app.yml).

  python scripts/package_windows.py stage --version 1.0.7      # after: npm --prefix server ci --omit=dev, npm run build
  iscc installer/HawarysBot.iss ...                              # makes dist/HawarysBot-Setup.exe from dist/stage
  python scripts/package_windows.py manifest --version 1.0.7    # writes dist/manifest.json for the auto-updater

dist/stage/
  runtime/   node/node.exe, chrome/ (Chrome for Testing: loads the extension from the command line), launch.cjs, runtime.json
  app/<version>/  server (+ node_modules), web/dist, extension, desktop
  app/current.txt, hawary.ico
dist/app.zip        the app/<version> folder: what normal updates download (small)
dist/manifest.json  latest version, runtime id, download links + SHA-256
"""
import argparse, hashlib, io, json, pathlib, shutil, sys, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
STAGE = DIST / 'stage'
REPO = 'Youssef-Hawary/hawarys-bot'


def fetch(url: str) -> bytes:
    print(f'  downloading {url}', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'hawarys-bot-build'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


def runtime_info():
    cfg = json.loads((ROOT / 'installer' / 'runtime.json').read_text())
    return cfg, f"r{cfg['rev']}"


def copy_tree(src: pathlib.Path, dst: pathlib.Path, skip=lambda p: False):
    for f in sorted(src.rglob('*')):
        rel = f.relative_to(src)
        if f.is_dir() or skip(rel):
            continue
        out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, out)


def stage_app(version: str):
    app = STAGE / 'app' / version
    server_mods = ROOT / 'server' / 'node_modules'
    web_dist = ROOT / 'web' / 'dist'
    if not server_mods.is_dir() or not (web_dist / 'index.html').is_file():
        sys.exit('Run "npm --prefix server ci --omit=dev" and "npm run build" first.')
    copy_tree(ROOT / 'server' / 'src', app / 'server' / 'src', skip=lambda p: p.name.endswith('.test.ts'))
    shutil.copy2(ROOT / 'server' / 'package.json', app / 'server' / 'package.json')
    copy_tree(server_mods, app / 'server' / 'node_modules')
    copy_tree(web_dist, app / 'web' / 'dist')
    copy_tree(ROOT / 'extension', app / 'extension', skip=lambda p: p.name == 'local.json')
    for name in ['main.ts', 'lib.ts', 'package.json']:
        (app / 'desktop').mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'desktop' / name, app / 'desktop' / name)
    (app / 'version.json').write_text(json.dumps({'version': version}))
    (STAGE / 'app' / 'current.txt').write_text(version)
    return app


def stage_runtime(fake: bool):
    cfg, rid = runtime_info()
    rt = STAGE / 'runtime'
    (rt / 'node').mkdir(parents=True, exist_ok=True)
    (rt / 'chrome').mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'desktop' / 'launch.cjs', rt / 'launch.cjs')
    if fake:  # for testing this script without downloads
        (rt / 'node' / 'node.exe').write_bytes(b'fake')
        (rt / 'chrome' / 'chrome.exe').write_bytes(b'fake')
        node_v, chrome_v = 'fake', 'fake'
    else:
        # Node: newest release of the configured major line, checked against nodejs.org's checksums.
        index = json.loads(fetch('https://nodejs.org/dist/index.json'))
        node_v = next(r['version'] for r in index if r['version'].startswith(f"v{cfg['node']}."))
        name = f'node-{node_v}-win-x64.zip'
        data = fetch(f'https://nodejs.org/dist/{node_v}/{name}')
        sums = fetch(f'https://nodejs.org/dist/{node_v}/SHASUMS256.txt').decode()
        want = next(line.split()[0] for line in sums.splitlines() if line.endswith(name))
        if hashlib.sha256(data).hexdigest() != want:
            sys.exit('Node download checksum mismatch')
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for member in ('node.exe', 'LICENSE'):
                (rt / 'node' / member).write_bytes(z.read(f'node-{node_v}-win-x64/{member}'))
        # Chrome for Testing: a normal Chrome that still allows --load-extension (branded Chrome dropped it in v137).
        versions = json.loads(fetch('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'))
        channel = versions['channels'][cfg['chrome']]
        chrome_v = channel['version']
        url = next(d['url'] for d in channel['downloads']['chrome'] if d['platform'] == 'win64')
        with zipfile.ZipFile(io.BytesIO(fetch(url))) as z:
            for m in z.infolist():
                if m.is_dir() or not m.filename.startswith('chrome-win64/'):
                    continue
                out = rt / 'chrome' / m.filename[len('chrome-win64/'):]
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(z.read(m))
    (rt / 'runtime.json').write_text(json.dumps({'id': rid, 'node': node_v, 'chrome': chrome_v}))
    print(f'  runtime {rid}: node {node_v}, chrome {chrome_v}')


def zip_dir(src: pathlib.Path, out: pathlib.Path):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(src.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(src).as_posix())


def sha256(p: pathlib.Path):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def cmd_stage(a):
    shutil.rmtree(DIST, ignore_errors=True)
    STAGE.mkdir(parents=True)
    app = stage_app(a.version)
    stage_runtime(a.fake_runtime)
    icons = ROOT / 'extension' / 'icons'
    sys.path.insert(0, str(ROOT / 'scripts'))
    from make_ico import make_ico
    make_ico(str(STAGE / 'hawary.ico'), [str(icons / n) for n in ('16.png', '48.png', '128.png')])
    zip_dir(app, DIST / 'app.zip')
    print(f'staged {a.version} in {STAGE.relative_to(ROOT)}; app.zip {round((DIST / "app.zip").stat().st_size / 1e6, 1)} MB')


def cmd_manifest(a):
    _, rid = runtime_info()
    base = f'https://github.com/{REPO}/releases/download/v{a.version}'
    setup = DIST / 'HawarysBot-Setup.exe'
    manifest = {
        'version': a.version,
        'runtime': rid,
        'app': {'url': f'{base}/app.zip', 'sha256': sha256(DIST / 'app.zip')},
        'setup': {'url': f'{base}/HawarysBot-Setup.exe', 'sha256': sha256(setup)},
    }
    (DIST / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('stage'); s.add_argument('--version', required=True); s.add_argument('--fake-runtime', action='store_true')
    m = sub.add_parser('manifest'); m.add_argument('--version', required=True)
    a = p.parse_args()
    {'stage': cmd_stage, 'manifest': cmd_manifest}[a.cmd](a)
