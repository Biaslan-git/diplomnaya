import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtMoney } from '../lib/format'

const axis = { fontSize: 12, fill: '#8c7762' }

function short(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + ' млн'
  if (v >= 1_000) return Math.round(v / 1000) + ' тыс'
  return String(v)
}

/** Столбчатая диаграмма сумм по периодам (последний столбец выделен). */
export function MoneyBars({ data, height = 260, highlightLast = true }: { data: { label: string; total: number }[]; height?: number; highlightLast?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="#efe8da" />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: '#e2d8c4' }} interval={0} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={short} width={56} />
        <Tooltip
          cursor={{ fill: 'rgba(250,189,77,.15)' }}
          formatter={(v) => [fmtMoney(Number(v)), 'Расходы']}
          contentStyle={{ borderRadius: 10, border: '1px solid #e2d8c4', boxShadow: '0 8px 24px rgba(42,31,22,.12)', fontSize: 13 }}
        />
        <Bar
          dataKey="total"
          radius={[5, 5, 0, 0]}
          fill="#f6a41f"
          shape={(p: { x?: number; y?: number; width?: number; height?: number; index?: number }) => {
            const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p
            const last = highlightLast && index === data.length - 1
            return <rect x={x} y={y} width={width} height={Math.max(height, 0)} rx={5} fill={last ? '#cc6a07' : '#f6a41f'} />
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
