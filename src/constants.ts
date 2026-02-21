export interface FurnitureSet {
  id: string;
  name: string;
  tableWidth: number; // mm
  tableDepth: number; // mm
  chairCount: number;
  unitPrice: number; // JPY
  color: string;
  enabled?: boolean;
}

export const FURNITURE_TYPES: FurnitureSet[] = [
  {
    id: 'type1',
    name: 'タイプ1 (1800x450)',
    tableWidth: 1800,
    tableDepth: 450,
    chairCount: 3,
    unitPrice: 50000, // Placeholder
    color: '#3b82f6' // Blue
  },
  {
    id: 'type2',
    name: 'タイプ2 (1500x450)',
    tableWidth: 1500,
    tableDepth: 450,
    chairCount: 2,
    unitPrice: 45000, // Placeholder
    color: '#10b981' // Emerald
  },
  {
    id: 'type3',
    name: 'タイプ3 (1200x450)',
    tableWidth: 1200,
    tableDepth: 450,
    chairCount: 2,
    unitPrice: 40000, // Placeholder
    color: '#f59e0b' // Amber
  }
];

export const CHAIR_DIMENSIONS = {
  width: 500,
  depth: 600
};

export type LayoutPattern = 'cramped' | 'standard' | 'spacious';

export const PATTERN_CONFIG: Record<LayoutPattern, { aisleGap: number; label: string }> = {
  cramped: { aisleGap: 1000, label: '窮屈' },
  standard: { aisleGap: 1300, label: '標準' },
  spacious: { aisleGap: 1600, label: '広壮' }
};
