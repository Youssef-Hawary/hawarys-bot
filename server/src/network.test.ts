import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLanAddresses } from './network.ts';

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4' as const, internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: null });
const v6 = (address: string) => ({ address, family: 'IPv6' as const, internal: false, netmask: 'ffff::', mac: '00:00:00:00:00:00', cidr: null, scopeid: 0 });

test('café PC with Ethernet, its own hotspot and VirtualBox: Ethernet first, hotspot last, VM skipped', () => {
  const r = pickLanAddresses({
    'Local Area Connection* 10': [v4('192.168.137.1')],
    'VirtualBox Host-Only Network': [v4('192.168.56.1')],
    Ethernet: [v6('fe80::1'), v4('192.168.88.5')],
    'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
  });
  assert.deepEqual(r.map(a => [a.address, a.kind]), [['192.168.88.5', 'lan'], ['192.168.137.1', 'hotspot']]);
});

test('Wi-Fi only, link-local and WSL ignored', () => {
  const r = pickLanAddresses({ 'Wi-Fi': [v4('10.0.0.23')], 'vEthernet (WSL)': [v4('172.20.0.1')], Ethernet: [v4('169.254.10.2')] });
  assert.deepEqual(r.map(a => a.address), ['10.0.0.23']);
});

test('unknown adapter names still count, after Ethernet/Wi-Fi', () => {
  const r = pickLanAddresses({ 'Realtek PCIe GbE': [v4('192.168.1.40')], 'Wi-Fi 2': [v4('192.168.1.41')] });
  assert.deepEqual(r.map(a => a.address), ['192.168.1.41', '192.168.1.40']);
});
