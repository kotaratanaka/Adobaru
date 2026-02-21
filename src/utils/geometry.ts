import { Point } from '../services/geminiService';

/**
 * Snaps polygon vertices to align with X and Y axes where possible,
 * creating a rectilinear (orthogonal) shape.
 * 
 * Strategy:
 * 1. Collect all unique X and Y coordinates.
 * 2. Cluster coordinates that are close to each other (within a threshold).
 * 3. Replace original coordinates with the cluster averages.
 */
export function snapToRectilinear(points: Point[], threshold: number = 20): Point[] {
  if (points.length < 3) return points;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const snapValues = (values: number[], tolerance: number): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[][] = [];
    
    if (sorted.length === 0) return [];

    let currentGroup = [sorted[0]];
    groups.push(currentGroup);

    for (let i = 1; i < sorted.length; i++) {
      const val = sorted[i];
      const prev = currentGroup[currentGroup.length - 1];
      
      if (Math.abs(val - prev) <= tolerance) {
        currentGroup.push(val);
      } else {
        currentGroup = [val];
        groups.push(currentGroup);
      }
    }

    // Map original value to group average
    const valueMap = new Map<number, number>();
    groups.forEach(group => {
      const avg = group.reduce((a, b) => a + b, 0) / group.length;
      group.forEach(v => valueMap.set(v, avg));
    });

    return values.map(v => valueMap.get(v) || v);
  };

  // Calculate dynamic threshold based on bounding box if needed, 
  // but fixed pixel threshold is usually fine for UI interaction.
  
  const newXs = snapValues(xs, threshold);
  const newYs = snapValues(ys, threshold);

  return points.map((_, i) => ({
    x: newXs[i],
    y: newYs[i]
  }));
}
