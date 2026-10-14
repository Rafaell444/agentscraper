"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#1E915A", "#2563EB", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#65A30D", "#9333EA", "#EA580C", "#475569"];

type NameValue = { name: string; value: number; count?: number };

export function StackedBars({
  data,
  keys,
  colors,
  height = 260,
}: {
  data: Record<string, string | number>[];
  keys: string[];
  colors: Record<string, string>;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((key, index) => (
            <Bar key={key} dataKey={key} stackId="a" fill={colors[key] ?? PALETTE[index % PALETTE.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({
  data,
  color = "#1E915A",
  height,
  unit = "",
}: {
  data: NameValue[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const h = height ?? Math.max(160, data.length * 28 + 30);
  return (
    <div style={{ width: "100%", height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => `${Number(value).toLocaleString("en-US")}${unit}`} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, height = 240 }: { data: NameValue[]; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {data.map((_, index) => (
              <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
