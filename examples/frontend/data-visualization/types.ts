export interface DataPoint {
  readonly timestamp: number;
  readonly value: number;
}

export interface ModelPoint extends DataPoint {
  /** 输入数组中的位置；排序后仍保留，便于把选择映射回领域记录。 */
  readonly sourceIndex: number;
}

export interface ScreenPoint extends ModelPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlotRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Domain {
  readonly min: number;
  readonly max: number;
}

export interface ChartModel {
  readonly points: readonly ModelPoint[];
  readonly xDomain: Domain;
  readonly yDomain: Domain;
}
