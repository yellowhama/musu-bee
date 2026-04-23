export function toPolylinePoints(
  values: number[],
  width: number,
  height: number,
  padding: number,
): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = width - padding * 2;
  const h = height - padding * 2;
  return values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * w;
      const y = padding + h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
