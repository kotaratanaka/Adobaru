/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Upload, Settings, Calculator, Maximize, MousePointer2, Check, Loader2, AlertCircle, MapPin, PenTool, Undo2, Trash2, CheckSquare, Grid, FileText, Ruler } from 'lucide-react';
import { analyzeFloorPlan, Point } from './services/geminiService';
import LayoutCanvas, { LayoutCanvasHandle } from './components/LayoutCanvas';
import EstimateModal from './components/EstimateModal';
import { generateLayout, PlacedItem } from './utils/layoutEngine';
import { snapToRectilinear } from './utils/geometry';
import { FURNITURE_TYPES, PATTERN_CONFIG, LayoutPattern, FurnitureSet } from './constants';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for PDF.js
// Use unpkg as it mirrors npm releases directly and is more likely to have the latest version immediately
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [polygon, setPolygon] = useState<Point[]>([]);
  const [holes, setHoles] = useState<Point[][]>([]);
  const [mode, setMode] = useState<'view' | 'edit_polygon' | 'set_scale' | 'draw_polygon' | 'draw_hole'>('view');
  
  // Drawing state
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [drawTab, setDrawTab] = useState<'point' | 'freehand'>('point');

  // Scale state
  const [scaleLine, setScaleLine] = useState<{ start: Point; end: Point } | null>(null);
  const [realLength, setRealLength] = useState<number>(10000); // mm
  const [scale, setScale] = useState<number>(0.1); // pixels per mm (default guess)
  const [isScaleSet, setIsScaleSet] = useState(false);
  
  // Layout state
  const [pattern, setPattern] = useState<LayoutPattern>('standard');
  const [items, setItems] = useState<PlacedItem[]>([]);
  const [furnitureTypes, setFurnitureTypes] = useState<FurnitureSet[]>(FURNITURE_TYPES);
  const [isLayoutGenerated, setIsLayoutGenerated] = useState(false);
  const [layoutResults, setLayoutResults] = useState<any>(null);
  const [selectedResultTab, setSelectedResultTab] = useState<string>('standard');
  const [isEstimateOpen, setIsEstimateOpen] = useState(false);
  
  const canvasRef = useRef<LayoutCanvasHandle>(null);
  
  // Stats
  const [totalCost, setTotalCost] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (mode === 'draw_polygon' || mode === 'draw_hole') {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, tempPoints]);

  // Drawing Actions
  const handleUndo = () => {
    setTempPoints(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setTempPoints([]);
  };

  const handleFinish = () => {
    if (tempPoints.length >= 3) {
      if (mode === 'draw_polygon') {
        setPolygon(tempPoints);
        setMode('view');
      } else if (mode === 'draw_hole') {
        setHoles([...holes, tempPoints]);
        // Do NOT switch back to view mode, allow adding more holes
        // setMode('view'); 
      }
      setTempPoints([]);
    } else {
      alert("少なくとも3つの点を指定してください。");
    }
  };

  // Rectify Polygon (Snap to Grid)
  const handleRectify = () => {
    if (polygon.length < 3) return;
    const rectified = snapToRectilinear(polygon, 20); // 20px threshold
    setPolygon(rectified);
  };

  // Handle Generate Layout
  const handleGenerateLayout = () => {
    if (polygon.length < 3 || !scale) {
      alert("範囲指定と縮尺設定を完了してください。");
      return;
    }
    
    const activeTypes = furnitureTypes.filter(t => t.enabled !== false);
    const patterns: LayoutPattern[] = ['cramped', 'standard', 'spacious'];
    const newResults: any = {};

    patterns.forEach(p => {
      const config = PATTERN_CONFIG[p];
      const generatedItems = generateLayout(
        polygon,
        holes,
        scale,
        p,
        activeTypes,
        config.aisleGap
      );

      let cost = 0;
      const counts: Record<string, number> = {};
      generatedItems.forEach(item => {
        cost += item.type.unitPrice;
        counts[item.type.name] = (counts[item.type.name] || 0) + 1;
      });

      newResults[p] = {
        items: generatedItems,
        cost,
        counts
      };
    });

    setLayoutResults(newResults);
    
    // Set initial view to standard
    setItems(newResults['standard'].items);
    setTotalCost(newResults['standard'].cost);
    setCounts(newResults['standard'].counts);
    setSelectedResultTab('standard');
    
    setIsLayoutGenerated(true);
  };

  // Reset layout when polygon or scale changes
  useEffect(() => {
    setIsLayoutGenerated(false);
    setItems([]);
  }, [polygon, scale]);

  // Handle Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      setIsConvertingPdf(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 2.0 }); // Render at higher resolution
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvasContext: context, viewport: viewport } as any).promise;
          const dataUrl = canvas.toDataURL('image/png');
          loadImage(dataUrl);
        }
      } catch (error) {
        console.error("PDF conversion failed", error);
        alert("PDFの読み込みに失敗しました。");
      } finally {
        setIsConvertingPdf(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        loadImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const loadImage = (dataUrl: string) => {
    setImage(dataUrl);
    
    // Load image to get dimensions
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      // Scale line will be drawn by user
      setScaleLine(null);
      // Default polygon (box) - but we want user to draw it now
      setPolygon([]);
      setTempPoints([]);
      setMode('draw_polygon'); // Auto-start drawing
    };
    img.src = dataUrl;
  };

  // Analyze with Gemini
  const handleAnalyze = async () => {
    if (!image || !imageSize) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeFloorPlan(image);
      // Convert normalized coordinates (0-1000) to pixel coordinates
      const pixelCorners = result.corners.map(p => ({
        x: (p.x / 1000) * imageSize.width,
        y: (p.y / 1000) * imageSize.height
      }));
      setPolygon(pixelCorners);
      setMode('view');
    } catch (error) {
      console.error("Analysis failed", error);
      alert("AIによる解析に失敗しました。手動で部屋の範囲を調整してください。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Calculate Scale
  const calculateScale = () => {
    if (!scaleLine) return;
    const dx = scaleLine.end.x - scaleLine.start.x;
    const dy = scaleLine.end.y - scaleLine.start.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Scale = pixels / mm
    const newScale = pixelDistance / realLength;
    setScale(newScale);
    setIsScaleSet(true);
    setMode('view');
  };

  // Handle Edge Click for Scale
  const handleEdgeClick = (lengthPx: number) => {
    const input = window.prompt("この辺の実際の長さ(mm)を入力してください:", Math.round(lengthPx / scale).toString());
    if (input) {
      const lengthMm = Number(input);
      if (!isNaN(lengthMm) && lengthMm > 0) {
        const newScale = lengthPx / lengthMm;
        setScale(newScale);
        // Don't exit mode immediately, let user verify
      }
    }
  };

  // Update Unit Price
  const handlePriceChange = (id: string, price: number) => {
    setFurnitureTypes(prev => prev.map(t => 
      t.id === id ? { ...t, unitPrice: price } : t
    ));
  };

  // Toggle Furniture Type
  const handleToggleType = (id: string) => {
    setFurnitureTypes(prev => prev.map(t => 
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
  };

  // Calculate Polygon Area (Shoelace Formula)
  const calculatePolygonArea = (poly: Point[], currentScale: number) => {
    if (poly.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y;
      area -= poly[j].x * poly[i].y;
    }
    area = Math.abs(area) / 2;
    // Convert px² to m²
    // scale is px/mm
    // area in px² / (scale * scale) = area in mm²
    // area in mm² / 1,000,000 = area in m²
    return (area / (currentScale * currentScale)) / 1_000_000;
  };

  const currentArea = calculatePolygonArea(polygon, scale);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
            AI Layout Planner
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            {imageSize ? `${imageSize.width} x ${imageSize.height} px` : '画像未選択'}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Result Screen */}
        {isLayoutGenerated ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">レイアウト生成結果</h2>
              <button
                onClick={() => {
                  setIsLayoutGenerated(false);
                  setItems([]); // Clear generated items
                  setCounts({});
                  setTotalCost(0);
                }}
                className="py-2 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium flex items-center gap-2"
              >
                <Undo2 className="w-4 h-4" />
                編集に戻る
              </button>
            </div>

            {/* Pattern Tabs */}
            <div className="flex gap-2 border-b border-gray-200 pb-1">
              {(['cramped', 'standard', 'spacious'] as LayoutPattern[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setSelectedResultTab(p);
                    if (layoutResults[p]) {
                      setItems(layoutResults[p]!.items);
                      setTotalCost(layoutResults[p]!.cost);
                      setCounts(layoutResults[p]!.counts);
                    }
                  }}
                  className={`px-6 py-3 rounded-t-lg font-medium text-sm transition-colors ${
                    selectedResultTab === p
                      ? 'bg-white border-x border-t border-gray-200 text-indigo-600 -mb-px'
                      : 'bg-gray-50 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {PATTERN_CONFIG[p].label} ({PATTERN_CONFIG[p].aisleGap}mm)
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left: Canvas (Clean View) */}
              <div className="lg:col-span-2 bg-white rounded-b-2xl rounded-tr-2xl shadow-sm border border-gray-100 overflow-hidden p-4">
                <LayoutCanvas
                  ref={canvasRef}
                  imageUrl={image || ''}
                  polygon={polygon}
                  holes={holes}
                  items={items}
                  scale={scale}
                  mode="view" // View mode only
                  hideGuides={true} // Hide red/blue lines
                />
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => canvasRef.current?.exportImage()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Upload className="w-4 h-4 rotate-180" />
                    画像を保存
                  </button>
                </div>
              </div>

              {/* Right: Results Summary */}
              <div className="space-y-6">
                <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    {PATTERN_CONFIG[selectedResultTab].label}プランの見積もり
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="text-sm text-gray-500 mb-1">概算合計金額</div>
                      <div className="text-3xl font-bold text-gray-900">
                        ¥{totalCost.toLocaleString()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">配置内訳</div>
                      {Object.entries(counts).map(([name, count]) => (
                        <div key={name} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                          <span className="text-sm text-gray-600">{name}</span>
                          <span className="font-mono font-medium">{count}台</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">使用面積</span>
                        <span className="font-mono font-medium">{currentArea.toFixed(2)} ㎡</span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-gray-500">坪数</span>
                        <span className="font-mono font-medium">{(currentArea * 0.3025).toFixed(2)} 坪</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setIsEstimateOpen(true)}
                      className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <FileText className="w-5 h-5" />
                      見積書を作成
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : (
          /* Setup Screen */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Controls */}
            <div className="space-y-6">
              
              {/* 1. Upload */}
              <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">1</div>
                  平面図をアップロード
                </h2>
                <div className="relative group">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center group-hover:border-indigo-400 transition-colors bg-gray-50 group-hover:bg-indigo-50/30">
                    {isConvertingPdf ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm text-gray-500">PDFを変換中...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-700">クリックして画像/PDFを選択</p>
                        <p className="text-xs text-gray-400 mt-1">またはドラッグ＆ドロップ</p>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* 2. Range Specification */}
              <section className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-opacity ${!image ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">2</div>
                    範囲指定
                  </h2>
                </div>
                
                <div className="text-sm text-gray-600 mb-4">
                  {mode === 'draw_polygon' ? (
                    <div className="flex items-start gap-2 text-indigo-600 bg-indigo-50 p-3 rounded-lg">
                      <MousePointer2 className="w-4 h-4 mt-0.5" />
                      <div>
                        <p className="font-medium">範囲（外枠）を指定中</p>
                        <p className="text-xs mt-1">
                          クリックで点を追加し、範囲を囲ってください。<br />
                          <span className="font-semibold">Shiftキー</span>を押しながらクリックすると、垂直・水平に線を引けます。
                        </p>
                      </div>
                    </div>
                  ) : mode === 'draw_hole' ? (
                    <div className="flex items-start gap-2 text-gray-600 bg-gray-100 p-3 rounded-lg">
                      <MousePointer2 className="w-4 h-4 mt-0.5" />
                      <div>
                        <p className="font-medium">
                          {tempPoints.length > 0 ? '除外エリアを指定中...' : '除外エリアを追加できます'}
                        </p>
                        <p className="text-xs mt-1">
                          {tempPoints.length > 0 
                            ? '範囲を囲って「このエリアを追加」を押してください。' 
                            : 'クリックして除外したい場所を囲ってください。複数のエリアを指定できます。'}
                          <br />
                          <span className="font-semibold">Shiftキー</span>で垂直・水平固定。
                        </p>
                      </div>
                    </div>
                  ) : polygon.length > 0 ? (
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                      <Check className="w-4 h-4" />
                      <span>範囲指定が完了しています</span>
                    </div>
                  ) : (
                    <p>
                      「範囲を指定」ボタンを押して、家具を配置したい部屋の範囲を囲ってください。
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                  {mode === 'view' ? (
                    <>
                      <button
                        onClick={() => {
                          setMode('draw_polygon');
                          setTempPoints([]);
                          setPolygon([]);
                          setHoles([]); // Reset holes when redrawing main polygon
                        }}
                        className="w-full py-2 px-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <PenTool className="w-4 h-4" />
                        {polygon.length > 0 ? '範囲を再指定' : '範囲を指定'}
                      </button>
                      
                      {polygon.length > 0 && (
                        <button
                          onClick={() => {
                            setMode('draw_hole');
                            setTempPoints([]);
                          }}
                          className="w-full py-2 px-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <CheckSquare className="w-4 h-4" />
                          除外エリアを追加
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Show "Complete" button only for main polygon or when drawing a hole */}
                      {(mode === 'draw_polygon' || (mode === 'draw_hole' && tempPoints.length >= 3)) && (
                        <button
                          onClick={handleFinish}
                          disabled={tempPoints.length < 3}
                          className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                        >
                          <Check className="w-4 h-4" />
                          {mode === 'draw_hole' ? 'このエリアを追加' : '完了'}
                        </button>
                      )}
                      
                      {mode === 'draw_hole' && (
                        <button
                          onClick={() => {
                            setMode('view');
                            setTempPoints([]);
                          }}
                          className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-md transition-colors ${
                            tempPoints.length === 0 
                              ? 'bg-green-600 text-white hover:bg-green-700' 
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <CheckSquare className="w-4 h-4" />
                          編集を終了
                        </button>
                      )}

                      <button
                        onClick={handleUndo}
                        disabled={tempPoints.length === 0}
                        className="py-2 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="一つ戻る"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                      
                      {/* Cancel button only for main polygon drawing */}
                      {mode === 'draw_polygon' && (
                        <button
                          onClick={() => {
                            setMode('view');
                            setTempPoints([]);
                          }}
                          className="py-2 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                          title="キャンセル"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
                
                {/* Rectify Button (Only show when polygon exists) */}
                {polygon.length >= 3 && mode !== 'draw_polygon' && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">
                      ヒント: 形が歪んでいる場合は、自動補正で直角に整えることができます。
                    </p>
                    <button
                      onClick={handleRectify}
                      className="w-full py-2 px-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Grid className="w-4 h-4" />
                      形状を整える（直角補正）
                    </button>
                  </div>
                )}
              </section>

              {/* 3. Scale Setting */}
              <section className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-opacity ${polygon.length < 3 ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">3</div>
                    縮尺設定
                  </h2>
                </div>

                <div className="space-y-4">
                  {mode !== 'set_scale' && (
                    <button
                      onClick={() => {
                        setMode('set_scale');
                        setScaleLine(null);
                        setIsScaleSet(false);
                      }}
                      className="w-full py-2 px-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Ruler className="w-4 h-4" />
                      縮尺を設定
                    </button>
                  )}

                  {mode === 'set_scale' && (
                    <div className="bg-blue-50 p-4 rounded-xl space-y-3">
                      <p className="text-xs text-blue-800">
                        図面上の寸法線（例: 10300）を見つけ、その両端を<strong>クリックして青い点線を引き</strong>、数値を入力してください。
                      </p>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-blue-900 whitespace-nowrap">実際の長さ:</label>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            value={realLength}
                            onChange={(e) => setRealLength(Number(e.target.value))}
                            className="w-full pl-3 pr-8 py-1.5 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <span className="absolute right-3 top-1.5 text-xs text-gray-500">mm</span>
                        </div>
                      </div>
                      <button
                        onClick={calculateScale}
                        disabled={!scaleLine}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        縮尺を適用
                      </button>
                    </div>
                  )}
                  
                  {scale && !Number.isNaN(scale) && Number.isFinite(scale) && (
                    <div className="text-xs text-gray-500 flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg">
                      <span>現在の縮尺:</span>
                      <span className="font-mono">1px = {(1/scale).toFixed(2)}mm</span>
                    </div>
                  )}
                </div>
              </section>

              {/* 4. Layout Settings */}
              <section className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-opacity ${!scale ? 'opacity-50 pointer-events-none' : ''}`}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">4</div>
                  レイアウト設定
                </h2>
                
                <div className="space-y-6">
                  {/* Furniture Types */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">使用する家具</label>
                    <div className="space-y-2">
                      {furnitureTypes.map((type) => (
                        <div key={type.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={type.enabled !== false}
                              onChange={() => handleToggleType(type.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{type.name}</div>
                              <div className="text-xs text-gray-500">
                                {type.tableWidth}x{type.tableDepth}mm • {type.chairCount}席
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">¥</span>
                            <input
                              type="number"
                              value={type.unitPrice}
                              onChange={(e) => handlePriceChange(type.id, Number(e.target.value))}
                              className="w-20 text-right text-sm bg-white border border-gray-200 rounded px-2 py-1"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerateLayout}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Calculator className="w-5 h-5" />
                    レイアウトを生成
                  </button>
                </div>
              </section>
            </div>

            {/* Right Column: Canvas */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4 min-h-[600px] flex flex-col">
                <div className="flex-1 bg-gray-50 rounded-xl overflow-hidden relative">
                  {!image ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                      <Upload className="w-12 h-12 mb-4 opacity-20" />
                      <p>左のメニューから画像をアップロードしてください</p>
                    </div>
                  ) : (
                    <LayoutCanvas
                      imageUrl={image}
                      polygon={polygon}
                      holes={holes}
                      items={items}
                      scale={scale}
                      onPolygonChange={setPolygon}
                      mode={mode}
                      scaleLine={scaleLine}
                      onScaleLineChange={setScaleLine}
                      onFinishDrawing={handleFinish}
                      tempPoints={tempPoints}
                      onTempPointsChange={setTempPoints}
                      onEdgeClick={handleEdgeClick}
                      showDimensions={isScaleSet}
                    />
                  )}
                </div>
                
                {/* Canvas Footer Info */}
                <div className="mt-4 flex items-center justify-between text-xs text-gray-500 px-2">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded-full opacity-20"></div>
                      <span>範囲指定</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-full opacity-20"></div>
                      <span>縮尺設定</span>
                    </div>
                  </div>
                  <div>
                    {mode === 'draw_polygon' && 'クリックで点を追加 / Shift+クリックで軸固定'}
                    {mode === 'set_scale' && 'クリックで始点と終点を指定 / Shift+クリックで軸固定'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <EstimateModal
        isOpen={isEstimateOpen}
        onClose={() => setIsEstimateOpen(false)}
        items={items}
        totalCost={totalCost}
        counts={counts}
      />
    </div>
  );
}

export default App;

