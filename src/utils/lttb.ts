export interface LTTBDataPoint {
  time: number;
  [key: string]: number | null;
}

export function lttbDownsample(
  points: LTTBDataPoint[],
  keys: string[],
  threshold: number,
): LTTBDataPoint[] {
  if (points.length <= threshold || keys.length === 0 || points.length <= 2) {
    return points;
  }

  const selectedTimes = new Set<number>();
  selectedTimes.add(points[0].time);
  selectedTimes.add(points[points.length - 1].time);

  for (const key of keys) {
    const times = lttbSingleKey(
      points.map((p) => p.time),
      points.map((p) => (typeof p[key] === "number" ? (p[key] as number) : 0)),
      threshold,
    );
    for (const t of times) {
      selectedTimes.add(t);
    }
  }

  const timeToPoint = new Map<number, LTTBDataPoint>();
  for (const point of points) {
    if (selectedTimes.has(point.time) && !timeToPoint.has(point.time)) {
      timeToPoint.set(point.time, point);
    }
  }

  return [...timeToPoint.values()].sort((a, b) => a.time - b.time);
}

function lttbSingleKey(
  times: number[],
  values: number[],
  threshold: number,
): number[] {
  const len = times.length;
  if (len <= threshold) return times;

  const sampled: number[] = [times[0]];
  const bucketSize = (len - 2) / (threshold - 2);

  let prevSelectedIndex = 0;

  for (let bucket = 0; bucket < threshold - 2; bucket++) {
    const bucketStart = Math.floor(bucket * bucketSize) + 1;
    const bucketEnd = Math.floor((bucket + 1) * bucketSize) + 1;

    const nextBucketStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, len);

    let avgX = 0;
    let avgY = 0;
    let count = 0;
    for (let i = nextBucketStart; i < nextBucketEnd; i++) {
      avgX += times[i];
      avgY += values[i];
      count++;
    }
    if (count > 0) {
      avgX /= count;
      avgY /= count;
    }

    let maxArea = -1;
    let bestIndex = bucketStart;

    const prevX = times[prevSelectedIndex];
    const prevY = values[prevSelectedIndex];

    for (let i = bucketStart; i < bucketEnd; i++) {
      const area =
        Math.abs(
          (prevX - avgX) * (values[i] - prevY) -
            (prevX - times[i]) * (avgY - prevY),
        ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        bestIndex = i;
      }
    }

    sampled.push(times[bestIndex]);
    prevSelectedIndex = bestIndex;
  }

  sampled.push(times[len - 1]);
  return sampled;
}
