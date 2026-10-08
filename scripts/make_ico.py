"""Packs PNG icons into one Windows .ico (PNG-in-ICO, Windows Vista and newer). Usage: make_ico.py out.ico a.png b.png ..."""
import struct, sys


def png_size(data: bytes):
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG file')
    return struct.unpack('>II', data[16:24])  # IHDR width, height


def make_ico(out: str, pngs: list[str]):
    images = [open(p, 'rb').read() for p in pngs]
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, body = b'', b''
    for data in images:
        w, h = png_size(data)
        entries += struct.pack('<BBBBHHII', w % 256, h % 256, 0, 0, 1, 32, len(data), offset)  # 256 is stored as 0
        body += data
        offset += len(data)
    with open(out, 'wb') as f:
        f.write(header + entries + body)


if __name__ == '__main__':
    make_ico(sys.argv[1], sys.argv[2:])
    print(f'wrote {sys.argv[1]}')
