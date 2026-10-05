import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const AXIS = { stroke: '#77808F', fontSize: 12, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, money = true }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 text-[13px]">
      <div className="mb-1 font-bold text-fg-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-fg-3">{p.name}</span>
          <span className="ml-auto font-bold">{money && p.dataKey !== 'orders' && p.dataKey !== 'offers' ? `$${Number(p.value).toFixed(2)}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data, keys, height = 260 }: { data: any[]; keys: { key: string; name: string; color: string }[]; height?: number }) {
  const short = data.map(d => ({ ...d, label: d.day.slice(5) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={short} margin={{ top: 10, right: 6, left: -12, bottom: 0 }}>
        <defs>
          {keys.map(k => (
            <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={k.color} stopOpacity={.45} />
              <stop offset="100%" stopColor={k.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={48} tickFormatter={v => `$${v}`} />
        <Tooltip content={<Tip />} cursor={{ stroke: 'rgba(56,198,244,.4)', strokeDasharray: '4 4' }} />
        {keys.map(k => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color} strokeWidth={2.4} fill={`url(#g-${k.key})`}
            dot={false} activeDot={{ r: 5, strokeWidth: 0, style: { filter: `drop-shadow(0 0 6px ${k.color})` } }} animationDuration={1200} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({ data, xKey, bars, height = 240, money = true }: { data: any[]; xKey: string; bars: { key: string; name: string; color: string }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 6, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
        <XAxis dataKey={xKey} {...AXIS} />
        <YAxis {...AXIS} width={48} tickFormatter={v => (money ? `$${v}` : v)} />
        <Tooltip content={<Tip money={money} />} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
        {bars.map(b => <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[8, 8, 2, 2]} maxBarSize={44} animationDuration={1000} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Tooltip content={<Tip />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none" animationDuration={1000}>
          {data.map(d => <Cell key={d.name} fill={d.color} style={{ filter: `drop-shadow(0 0 8px ${d.color}66)` }} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
