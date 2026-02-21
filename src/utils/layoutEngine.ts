import { Point } from '../services/geminiService';
import { FurnitureSet, CHAIR_DIMENSIONS } from '../constants';

export interface PlacedItem {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: FurnitureSet;
}

// Helper to check if a point is inside a polygon (Ray casting algorithm)
function isPointInPolygon(point: Point, vs: Point[]) {
  // ray-casting algorithm based on
  // https://github.com/substack/point-in-polygon
  var x = point.x, y = point.y;
  
  var inside = false;
  for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      var xi = vs[i].x, yi = vs[i].y;
      var xj = vs[j].x, yj = vs[j].y;
      
      var intersect = ((yi > y) != (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
  }
  
  return inside;
}

// Helper to check if a rectangle is fully inside a polygon AND outside all holes
function isRectValid(x: number, y: number, w: number, h: number, polygon: Point[], holes: Point[][]) {
  const corners = [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
    // Also check center point to catch small holes inside large rects
    { x: x + w/2, y: y + h/2 }
  ];

  // Must be inside the main polygon
  const insideMain = corners.every(p => isPointInPolygon(p, polygon));
  if (!insideMain) return false;

  // Must be outside ALL holes
  // If any corner is inside any hole, it's invalid
  for (const hole of holes) {
    if (corners.some(p => isPointInPolygon(p, hole))) {
      return false;
    }
  }

  return true;
}

export function generateLayout(
  polygon: Point[],
  holes: Point[][],
  scale: number, // pixels per mm
  pattern: 'cramped' | 'standard' | 'spacious',
  furnitureTypes: FurnitureSet[],
  aisleGap: number
): PlacedItem[] {
  const items: PlacedItem[] = [];
  
  // Find bounding box of polygon
  const minX = Math.min(...polygon.map(p => p.x));
  const maxX = Math.max(...polygon.map(p => p.x));
  const minY = Math.min(...polygon.map(p => p.y));
  const maxY = Math.max(...polygon.map(p => p.y));

  // Convert dimensions to pixels
  const pxAisleGap = aisleGap * scale;
  
  let currentY = minY + pxAisleGap;

  while (currentY < maxY) {
    let currentX = minX + pxAisleGap;
    let rowHeight = 0;
    
    // Try to fit items in this row
    while (currentX < maxX) {
      let placed = false;
      
      // Try to fit the enabled furniture types
      // We iterate through types to see if any fit at current position
      for (const fType of furnitureTypes) {
        // Skip if disabled (though filtering should happen before calling this)
        if (fType.enabled === false) continue;

        const w = fType.tableWidth * scale;
        const h = fType.tableDepth * scale;
        const chairD = CHAIR_DIMENSIONS.depth * scale;
        
        // Total footprint height (Table + Chair space)
        const totalH = h + chairD; 
        
        // Check if this spot is valid (inside polygon, outside holes)
        if (isRectValid(currentX, currentY, w, totalH, polygon, holes)) {
          items.push({
            id: crypto.randomUUID(),
            x: currentX,
            y: currentY,
            rotation: 0,
            type: fType
          });
          
          currentX += w + (50 * scale); // 50mm gap between tables side-by-side
          rowHeight = Math.max(rowHeight, totalH);
          placed = true;
          break; // Placed one item, move X forward
        }
      }
      
      if (!placed) {
        // If no furniture fit here, move X a bit to search for next valid spot
        currentX += 50 * scale; 
      }
    }
    
    if (rowHeight > 0) {
      currentY += rowHeight + pxAisleGap;
    } else {
      // If no items were placed in this entire row scan, advance Y
      currentY += 100 * scale; 
    }
  }

  return items;
}
