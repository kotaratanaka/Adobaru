import React, { forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect, Circle, Group, Text, Shape } from 'react-konva';
import useImage from 'use-image';
import { Point } from '../services/geminiService';
import { PlacedItem } from '../utils/layoutEngine';
import { CHAIR_DIMENSIONS } from '../constants';

export interface LayoutCanvasHandle {
  exportImage: () => void;
}

interface LayoutCanvasProps {
  imageUrl: string;
  polygon: Point[];
  items: PlacedItem[];
  scale: number; // pixels per mm
  onPolygonChange?: (newPolygon: Point[]) => void;
  mode: 'view' | 'edit_polygon' | 'set_scale' | 'draw_polygon' | 'draw_hole';
  scaleLine?: { start: Point; end: Point } | null;
  onScaleLineChange?: (line: { start: Point; end: Point }) => void;
  onFinishDrawing?: () => void;
  tempPoints?: Point[];
  onTempPointsChange?: (points: Point[]) => void;
  onEdgeClick?: (lengthPx: number) => void;
  showDimensions?: boolean;
  hideGuides?: boolean;
  holes?: Point[][];
}

// Helper to calculate distance between point and line segment
function pDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  var A = x - x1;
  var B = y - y1;
  var C = x2 - x1;
  var D = y2 - y1;

  var dot = A * C + B * D;
  var len_sq = C * C + D * D;
  var param = -1;
  if (len_sq !== 0) //in case of 0 length line
      param = dot / len_sq;

  var xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  }
  else if (param > 1) {
    xx = x2;
    yy = y2;
  }
  else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  var dx = x - xx;
  var dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

const LayoutCanvas = forwardRef<LayoutCanvasHandle, LayoutCanvasProps>(({
  imageUrl,
  polygon,
  items,
  scale,
  onPolygonChange,
  mode,
  scaleLine,
  onScaleLineChange,
  onFinishDrawing,
  tempPoints = [],
  onTempPointsChange,
  onEdgeClick,
  showDimensions,
  hideGuides,
  holes = []
}, ref) => {
  const [image] = useImage(imageUrl);
  const stageRef = React.useRef<any>(null);

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      if (stageRef.current) {
        const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `layout-plan-${new Date().toISOString().slice(0,10)}.png`;
        link.href = uri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  }));
  
  // Drawing state
  const [mousePos, setMousePos] = React.useState<Point | null>(null);

  // Hover state for edge dimensions
  const [hoveredEdge, setHoveredEdge] = React.useState<{ index: number; x: number; y: number; length: number } | null>(null);

  // Reset mouse pos when entering draw mode
  React.useEffect(() => {
    if (mode === 'draw_polygon' || mode === 'draw_hole') {
      setMousePos(null);
    }
  }, [mode]);

  // Handle polygon dragging
  const handlePointDragMove = (index: number, e: any) => {
    if (!onPolygonChange) return;
    const newPoly = [...polygon];
    newPoly[index] = { x: e.target.x(), y: e.target.y() };
    onPolygonChange(newPoly);
  };

  // Handle adding a new point to the polygon (Insert on line)
  const handleLineClick = (e: any) => {
    if (mode !== 'edit_polygon' || !onPolygonChange) return;
    
    const stage = e.target.getStage();
    const pointer = stage.getRelativePointerPosition();
    const x = pointer.x;
    const y = pointer.y;

    // Find the closest segment to insert the point
    let minDistance = Infinity;
    let insertIndex = -1;

    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const dist = pDistance(x, y, p1.x, p1.y, p2.x, p2.y);
      
      if (dist < minDistance) {
        minDistance = dist;
        insertIndex = i + 1;
      }
    }

    if (insertIndex !== -1) {
      const newPoly = [...polygon];
      newPoly.splice(insertIndex, 0, { x, y });
      onPolygonChange(newPoly);
    }
  };

  // Handle removing a point
  const handlePointDblClick = (index: number) => {
    if (mode !== 'edit_polygon' || !onPolygonChange) return;
    if (polygon.length <= 3) return; // Keep at least a triangle

    const newPoly = [...polygon];
    newPoly.splice(index, 1);
    onPolygonChange(newPoly);
  };

  // Handle scale line dragging
  const handleScalePointDrag = (point: 'start' | 'end', e: any) => {
    if (!onScaleLineChange || !scaleLine) return;
    const newLine = { ...scaleLine };
    newLine[point] = { x: e.target.x(), y: e.target.y() };
    onScaleLineChange(newLine);
  };

  // Handle scale line creation (click to set start/end)
  const handleScaleLineClick = (e: any) => {
    if (mode !== 'set_scale' || !onScaleLineChange) return;
    
    // If line already exists, ignore (drag handles it)
    if (scaleLine) return;

    const pos = getStagePointerPos();
    if (!pos) return;

    if (tempPoints.length === 0) {
      // First point
      if (onTempPointsChange) onTempPointsChange([pos]);
    } else {
      // Second point - finish line
      onScaleLineChange({ start: tempPoints[0], end: pos });
      if (onTempPointsChange) onTempPointsChange([]);
    }
  };

  if (!image) return <div>画像を読み込み中...</div>;

  // Calculate canvas size based on image aspect ratio, max width 800
  const aspectRatio = image.width / image.height;
  const width = Math.min(800, window.innerWidth - 40);
  const height = width / aspectRatio;
  
  // Scale factor for display (image pixels to screen pixels)
  const displayScale = width / image.width;

  // Calculate polygon centroid for label offset
  const getPolygonCentroid = () => {
    if (polygon.length === 0) return { x: 0, y: 0 };
    let x = 0, y = 0;
    polygon.forEach(p => { x += p.x; y += p.y; });
    return { x: x / polygon.length, y: y / polygon.length };
  };
  const centroid = getPolygonCentroid();

  // --- Drawing Mode Handlers ---

  const getStagePointerPos = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return null;
    // Convert to image coordinates
    return {
      x: pointer.x / displayScale,
      y: pointer.y / displayScale
    };
  };

  const handleStageMouseMove = (e: any) => {
    let pos = getStagePointerPos();
    if (!pos) return;

    // Shift key logic for axis locking
    // Applies to both 'draw_polygon' (adding points) and 'set_scale' (drawing scale line)
    if (e.evt.shiftKey && tempPoints.length > 0) {
      const lastPoint = tempPoints[tempPoints.length - 1];
      const dx = Math.abs(pos.x - lastPoint.x);
      const dy = Math.abs(pos.y - lastPoint.y);
      
      if (dx > dy) {
        pos.y = lastPoint.y; // Lock Y (Horizontal line)
      } else {
        pos.x = lastPoint.x; // Lock X (Vertical line)
      }
    }

    if (mode === 'draw_polygon' || mode === 'draw_hole') {
      setMousePos(pos);
    } else if (mode === 'set_scale' && !scaleLine) {
      // Preview for scale line drawing
      setMousePos(pos);
    }
  };

  const handleStageClick = (e: any) => {
    let pos = getStagePointerPos();
    if (!pos) return;

    // Shift key logic (same as mouse move to ensure click matches preview)
    if (e.evt.shiftKey && tempPoints.length > 0) {
      const lastPoint = tempPoints[tempPoints.length - 1];
      const dx = Math.abs(pos.x - lastPoint.x);
      const dy = Math.abs(pos.y - lastPoint.y);
      
      if (dx > dy) {
        pos.y = lastPoint.y;
      } else {
        pos.x = lastPoint.x;
      }
    }

    if (mode === 'draw_polygon' || mode === 'draw_hole') {
      if (onTempPointsChange) {
        onTempPointsChange([...tempPoints, pos]);
      }
    } else if (mode === 'set_scale' && !scaleLine) {
      // Handle scale line click with the (potentially shifted) pos
      if (!onScaleLineChange) return;
      
      if (tempPoints.length === 0) {
        // First point
        if (onTempPointsChange) onTempPointsChange([pos]);
      } else {
        // Second point - finish line
        onScaleLineChange({ start: tempPoints[0], end: pos });
        if (onTempPointsChange) onTempPointsChange([]);
      }
    }
  };

  const handleFinishDrawing = () => {
    if (tempPoints.length >= 3 && onPolygonChange) {
      onPolygonChange(tempPoints);
      if (onFinishDrawing) onFinishDrawing();
    }
  };

  return (
    <Stage 
      width={width} 
      height={height} 
      ref={stageRef} 
      className={`border border-gray-200 shadow-sm rounded-lg overflow-hidden ${mode === 'draw_polygon' || mode === 'draw_hole' ? 'cursor-crosshair' : ''}`}
      onMouseMove={handleStageMouseMove}
      onClick={handleStageClick}
      onTap={handleStageClick}
    >
      <Layer scaleX={displayScale} scaleY={displayScale}>
        <KonvaImage image={image} />
        
        {/* --- View / Edit Mode --- */}
        {mode !== 'draw_polygon' && !hideGuides && (
          <Group>
            {/* Room Polygon (Visual) - Using a Group with clipping logic for holes */}
            {/* Since Konva doesn't support direct hole subtraction easily in one shape, 
                we can draw the main polygon, and then draw holes with 'destination-out' 
                composite operation to "cut" them out if we were using a cached canvas, 
                but for simple vector lines, we might just draw holes on top.
                
                However, the user wants the "red fill" to NOT be present in the holes.
                The easiest way in Konva without complex path data strings is to use the 
                even-odd winding rule if we could combine paths, but Konva's Line doesn't support multiple paths easily.
                
                Alternative: Draw the main polygon with fill. Then draw holes with a fill color that matches the background? 
                No, background is an image.
                
                Better approach: Use a Path shape with SVG path data that describes the polygon AND the holes.
            */}
            
            {/* We will construct an SVG path string. 
                M x0 y0 L x1 y1 ... Z 
                M hx0 hy0 L hx1 hy1 ... Z 
                uses even-odd rule by default in many renderers or we can specify fill-rule.
            */}
            
            <Line
                points={polygon.flatMap(p => [p.x, p.y])}
                closed
                stroke="#ef4444"
                strokeWidth={2 / displayScale}
                // We don't fill here, we use a separate shape for the fill with holes
                fillEnabled={false}
            />
            
            {/* Fill Shape with Holes */}
            {/* We use the native Canvas API via a Custom shape or just rely on the fact that 
                Konva doesn't easily support holes in simple Lines. 
                
                Let's try drawing the holes on top with a special composite operation?
                Actually, simpler: Just don't fill the main polygon above. 
                Draw a Shape that handles the fill.
            */}
            
            {/* Custom Shape for Polygon with Holes Fill */}
            <Shape
              sceneFunc={(context, shape) => {
                context.beginPath();
                
                // Draw main polygon
                if (polygon.length > 0) {
                  context.moveTo(polygon[0].x, polygon[0].y);
                  for (let i = 1; i < polygon.length; i++) {
                    context.lineTo(polygon[i].x, polygon[i].y);
                  }
                  context.closePath();
                }

                // Draw holes (counter-clockwise or just separate sub-paths)
                // The winding rule 'evenodd' usually handles this if we just add them as subpaths
                holes.forEach(hole => {
                  if (hole.length > 0) {
                    context.moveTo(hole[0].x, hole[0].y);
                    for (let i = 1; i < hole.length; i++) {
                      context.lineTo(hole[i].x, hole[i].y);
                    }
                    context.closePath();
                  }
                });

                context.fillStrokeShape(shape);
              }}
              fill="rgba(239, 68, 68, 0.1)"
              fillRule="evenodd"
              listening={false} // Let clicks pass through to the lines/image if needed
            />

            {/* Invisible Hit Lines for Hover Detection */}
            {polygon.map((p1, i) => {
              const p2 = polygon[(i + 1) % polygon.length];
              const distPx = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
              const distMm = distPx / scale;

              return (
                <Line
                  key={`hit-edge-${i}`}
                  points={[p1.x, p1.y, p2.x, p2.y]}
                  stroke="transparent"
                  strokeWidth={20 / displayScale}
                  onMouseEnter={(e) => {
                    const stage = e.target.getStage();
                    if (stage) {
                      const ptr = stage.getRelativePointerPosition();
                      if (ptr) {
                        setHoveredEdge({
                          index: i,
                          x: ptr.x / displayScale,
                          y: ptr.y / displayScale,
                          length: distMm
                        });
                      }
                    }
                  }}
                  onMouseMove={(e) => {
                    const stage = e.target.getStage();
                    if (stage) {
                      const ptr = stage.getRelativePointerPosition();
                      if (ptr) {
                        setHoveredEdge(prev => prev ? { ...prev, x: ptr.x / displayScale, y: ptr.y / displayScale } : null);
                      }
                    }
                  }}
                  onMouseLeave={() => setHoveredEdge(null)}
                  onClick={handleLineClick}
                  onTap={handleLineClick}
                />
              );
            })}
            
            {/* Holes Outlines */}
            {holes.map((hole, i) => (
              <Line
                key={`hole-${i}`}
                points={hole.flatMap(p => [p.x, p.y])}
                closed
                stroke={hideGuides ? "transparent" : "#9ca3af"} // Light gray border
                strokeWidth={hideGuides ? 0 : 2 / displayScale}
                fillEnabled={false} // No fill for the outline itself, handled by the Shape above
                dash={[5, 5]}
              />
            ))}

            {/* Polygon Handles (only in edit mode) */}
            {mode === 'edit_polygon' && polygon.map((p, i) => (
              <Circle
                key={`poly-${i}`}
                x={p.x}
                y={p.y}
                radius={6 / displayScale}
                fill="#ef4444"
                draggable
                onDragMove={(e) => handlePointDragMove(i, e)}
                onDblClick={() => handlePointDblClick(i)}
                onDblTap={() => handlePointDblClick(i)}
                stroke="white"
                strokeWidth={1 / displayScale}
              />
            ))}
          </Group>
        )}

        {/* Hover Tooltip for Edge Length */}
        {hoveredEdge && !hideGuides && (
          <Group x={hoveredEdge.x} y={hoveredEdge.y - (20 / displayScale)}>
            <Rect
              x={-40 / displayScale}
              y={-15 / displayScale}
              width={80 / displayScale}
              height={30 / displayScale}
              fill="rgba(0, 0, 0, 0.8)"
              cornerRadius={4 / displayScale}
            />
            <Text
              text={`${Math.round(hoveredEdge.length)}mm`}
              fontSize={14 / displayScale}
              fill="white"
              align="center"
              verticalAlign="middle"
              width={80 / displayScale}
              height={30 / displayScale}
              x={-40 / displayScale}
              y={-15 / displayScale}
            />
          </Group>
        )}

        {/* --- Drawing Mode --- */}
        {(mode === 'draw_polygon' || mode === 'draw_hole') && (
          <>
            {/* Confirmed Lines */}
            <Line
              points={tempPoints.flatMap(p => [p.x, p.y])}
              stroke={mode === 'draw_hole' ? "#6b7280" : "#ef4444"}
              strokeWidth={2 / displayScale}
              dash={mode === 'draw_hole' ? [10, 5] : undefined}
            />
            
            {/* Rubber Band (Preview Line) */}
            {tempPoints.length > 0 && mousePos && (
              <Line
                points={[
                  tempPoints[tempPoints.length - 1].x,
                  tempPoints[tempPoints.length - 1].y,
                  mousePos.x,
                  mousePos.y
                ]}
                stroke={mode === 'draw_hole' ? "#6b7280" : "#ef4444"}
                strokeWidth={1 / displayScale}
                dash={[5 / displayScale, 5 / displayScale]}
              />
            )}

            {/* Vertices */}
            {tempPoints.map((p, i) => (
              <Circle
                key={`temp-${i}`}
                x={p.x}
                y={p.y}
                stroke="white"
                strokeWidth={1 / displayScale}
                // Allow clicking first point to close
                onClick={(e) => {
                  if (i === 0 && tempPoints.length >= 3) {
                    e.cancelBubble = true; // Prevent stage click
                    handleFinishDrawing();
                  }
                }}
                onTap={(e) => {
                  if (i === 0 && tempPoints.length >= 3) {
                    e.cancelBubble = true;
                    handleFinishDrawing();
                  }
                }}
                // Highlight start point when ready to close
                fill={i === 0 && tempPoints.length >= 3 ? "#10b981" : (mode === 'draw_hole' ? "#6b7280" : "#ef4444")}
                radius={i === 0 && tempPoints.length >= 3 ? 6 / displayScale : 4 / displayScale}
              />
            ))}
            
            {/* Mouse Cursor Indicator */}
            {mousePos && (
              <Circle
                x={mousePos.x}
                y={mousePos.y}
                radius={3 / displayScale}
                fill={mode === 'draw_hole' ? "#6b7280" : "#ef4444"}
                opacity={0.5}
              />
            )}
          </>
        )}

        {/* Edge Lengths (Show when showDimensions is true) - REMOVED per request */}
        
        {/* Scale Line (only in set_scale mode) */}
        {mode === 'set_scale' && !hideGuides && (
          <>
            {/* Scale Line Drawing Preview */}
            {!scaleLine && tempPoints.length > 0 && mousePos && (
              <Line
                points={[
                  tempPoints[0].x,
                  tempPoints[0].y,
                  mousePos.x,
                  mousePos.y
                ]}
                stroke="#3b82f6"
                strokeWidth={2 / displayScale}
                dash={[5 / displayScale, 5 / displayScale]}
              />
            )}
            
            {/* Scale Line Start Point Preview */}
            {!scaleLine && tempPoints.length > 0 && (
              <Circle
                x={tempPoints[0].x}
                y={tempPoints[0].y}
                radius={4 / displayScale}
                fill="#3b82f6"
              />
            )}

            {scaleLine && (
              <>
                <Line
                  points={[scaleLine.start.x, scaleLine.start.y, scaleLine.end.x, scaleLine.end.y]}
                  stroke="#3b82f6"
                  strokeWidth={2 / displayScale}
                  dash={[10, 5]}
                />
                <Circle
                  x={scaleLine.start.x}
                  y={scaleLine.start.y}
                  radius={6 / displayScale}
                  fill="#3b82f6"
                  draggable
                  onDragMove={(e) => handleScalePointDrag('start', e)}
                />
                <Circle
                  x={scaleLine.end.x}
                  y={scaleLine.end.y}
                  radius={6 / displayScale}
                  fill="#3b82f6"
                  draggable
                  onDragMove={(e) => handleScalePointDrag('end', e)}
                />
              </>
            )}
          </>
        )}

        {/* Furniture Items (Only show if NOT drawing, to avoid clutter, or show dim?) */}
        {mode !== 'draw_polygon' && items.map(item => (
          <Group key={item.id} x={item.x} y={item.y} rotation={item.rotation}>
            {/* Table */}
            <Rect
              width={item.type.tableWidth * scale}
              height={item.type.tableDepth * scale}
              fill={item.type.color}
              stroke="black"
              strokeWidth={1 / displayScale}
            />
            {/* Chairs */}
            {Array.from({ length: item.type.chairCount }).map((_, i) => {
               // Distribute chairs along the width
               const chairW = CHAIR_DIMENSIONS.width * scale;
               const chairD = CHAIR_DIMENSIONS.depth * scale;
               const tableW = item.type.tableWidth * scale;
               const spacing = (tableW - (item.type.chairCount * chairW)) / (item.type.chairCount + 1);
               const xPos = spacing + i * (chairW + spacing);
               
               return (
                 <Group key={i} x={xPos} y={item.type.tableDepth * scale}>
                   {/* Chair Body */}
                   <Rect
                      width={chairW}
                      height={chairD * 0.7} // Visual depth slightly less than full footprint
                      fill="white"
                      stroke="black"
                      strokeWidth={1 / displayScale}
                      cornerRadius={4}
                   />
                   {/* Chair Back */}
                   <Rect
                      y={chairD * 0.5}
                      width={chairW}
                      height={chairD * 0.2}
                      fill="white"
                      stroke="black"
                      strokeWidth={1 / displayScale}
                      cornerRadius={2}
                   />
                 </Group>
               );
            })}
          </Group>
        ))}
      </Layer>
    </Stage>
  );
});

export default LayoutCanvas;
