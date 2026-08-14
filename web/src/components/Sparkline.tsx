import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { MetricPoint } from '../types';

interface SeriesDef {
  key: keyof Omit<MetricPoint, 'ts'>;
  label: string;
  stroke: string;
  fill?: boolean;
  scale?: string;
}

interface Props {
  points: MetricPoint[];
  series: SeriesDef[];
  height?: number;
  showAxes?: boolean;
  formatters?: Partial<Record<string, (v: number) => string>>;
}

export default function Sparkline({ points, series, height = 120, showAxes = false, formatters }: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const formattersRef = useRef(formatters);
  formattersRef.current = formatters;

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    const seriesDefs = seriesRef.current;
    const fmtTime = uPlot.fmtDate('{HH}:{mm}');
    const axes: uPlot.Axis[] = showAxes
      ? [
          {
            stroke: '#475569',
            grid: { stroke: 'rgba(71,85,105,0.15)' },
            values: (_u: uPlot, splits: number[]) => splits.map((v) => fmtTime(new Date(v))),
            size: 56,
          },
          { stroke: '#475569', grid: { stroke: 'rgba(71,85,105,0.15)' } },
        ]
      : [];

    const scales: uPlot.Scales = { x: { time: true }, primary: {} };
    for (const s of seriesDefs) {
      const key = s.scale || 'primary';
      if (!scales[key]) scales[key] = {};
    }

    const u = new uPlot(
      {
        width: holder.clientWidth || 600,
        height,
        scales,
        axes,
        series: [
          { label: 'time' },
          ...seriesDefs.map((s) => ({
            label: s.label,
            stroke: s.stroke,
            width: 1.5,
            fill: s.fill ? `${s.stroke}22` : undefined,
            value: (self: uPlot, raw: number) => {
              const f = formattersRef.current?.[String(s.key)];
              return f ? f(raw) : String(Math.round(raw * 10) / 10);
            },
          })),
        ],
        legend: { show: true, isolate: false },
        cursor: { y: false },
        hooks: { init: [(plot: uPlot) => plotRef.current = plot] },
      },
      buildData(points, seriesDefs),
      holder
    );
    plotRef.current = u;

    const ro = new ResizeObserver(() => {
      if (holder.clientWidth > 0) u.setSize({ width: holder.clientWidth, height });
    });
    ro.observe(holder);
    return () => {
      ro.disconnect();
      u.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = plotRef.current;
    if (u && points.length > 0) {
      u.setData(buildData(points, seriesRef.current));
    }
  }, [points]);

  if (points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-600">
        No metrics yet.
      </div>
    );
  }

  return <div ref={holderRef} className="w-full" />;
}

function buildData(points: MetricPoint[], series: SeriesDef[]): uPlot.AlignedData {
  if (points.length === 0) return [[], ...series.map(() => [])];
  const cols: (number | null | undefined)[][] = [points.map((p) => p.ts) as number[]];
  for (const s of series) cols.push(points.map((p) => (p[s.key] as number) ?? null));
  return cols as uPlot.AlignedData;
}