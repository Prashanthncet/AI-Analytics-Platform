"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart as EChartsLineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([EChartsLineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface SeriesPoint {
  date: string;
  value: number;
}

export function LineChart({
  data,
  name,
  color = "#3b82f6",
  height = 240,
  ySuffix = "",
}: {
  data: SeriesPoint[];
  name: string;
  color?: string;
  height?: number;
  ySuffix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(el, undefined, { renderer: "canvas" });
    }
    const chart = instanceRef.current;

    chart.setOption({
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        borderColor: "rgba(148, 163, 184, 0.3)",
        textStyle: { color: "#e2e8f0", fontSize: 12 },
        formatter: (params: { value: number; axisValue: string }[]) => {
          if (!params || params.length === 0) return "";
          const p = params[0];
          return `<strong>${p.axisValue}</strong><br/>${name}: ${p.value.toLocaleString()}${ySuffix}`;
        },
      },
      grid: { left: 50, right: 16, top: 8, bottom: 24 },
      xAxis: {
        type: "category",
        data: data.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8", fontSize: 10, formatter: (v: number) => `${v.toLocaleString()}${ySuffix}` },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
      },
      series: [
        {
          type: "line",
          data: data.map((d) => d.value),
          smooth: true,
          symbol: "none",
          lineStyle: { color, width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: `${color}05` },
            ]),
          },
        },
      ],
      animationDuration: 500,
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose(); // free the canvas + listeners when the chart unmounts
      instanceRef.current = null;
    };
  }, [data, name, color, ySuffix]);

  return <div ref={ref} style={{ height, width: "100%" }} />;
}