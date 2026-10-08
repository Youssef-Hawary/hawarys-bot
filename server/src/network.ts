// Which addresses workers on the same network (café, home) can use to open the dashboard.
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export type LanAddress = { address: string; adapter: string; kind: 'lan' | 'hotspot' };

// Adapters that never lead to the café/home network: virtual machines, WSL, VPNs, Bluetooth.
const VIRTUAL = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Tailscale|ZeroTier|Hamachi|Bluetooth|docker|vboxnet|virbr|br-|veth|utun|tun\d|tap\d/i;
// Windows "Mobile hotspot": its own small network, only for devices connected to this PC's hotspot.
const isHotspot = (adapter: string, address: string) => address.startsWith('192.168.137.') || /^Local Area Connection\*/i.test(adapter);
const preferred = (adapter: string) => /^(Ethernet|Wi-?Fi|WLAN|eth|en|wl)/i.test(adapter);

/** Real network addresses, best first: normal Ethernet/Wi-Fi before others, the Windows hotspot last. */
export function pickLanAddresses(ifaces: Record<string, NetworkInterfaceInfo[] | undefined>): LanAddress[] {
  const out: (LanAddress & { rank: number })[] = [];
  for (const [adapter, list] of Object.entries(ifaces)) {
    if (VIRTUAL.test(adapter)) continue;
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue;
      const hotspot = isHotspot(adapter, i.address);
      out.push({ address: i.address, adapter, kind: hotspot ? 'hotspot' : 'lan', rank: hotspot ? 2 : preferred(adapter) ? 0 : 1 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _, ...a }) => a);
}

/** Dashboard links for other devices. Empty when the server only listens on this PC (HOST=127.0.0.1). */
export function lanLinks(port: number, host = process.env.HOST ?? '127.0.0.1') {
  if (host !== '0.0.0.0' && host !== '::') return [];
  return pickLanAddresses(networkInterfaces()).map(a => ({ ...a, url: `http://${a.address}:${port}` }));
}
