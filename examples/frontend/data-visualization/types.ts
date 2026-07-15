export interface DataPoint {
  readonly timestamp: number;
  readonly value: number;
}

export interface ScreenPoint extends DataPoint {
  readonly x: number;
  readonly y: number;
  readonly sourceIndex: number;
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
  readonly points: readonly DataPoint[];
  readonly xDomain: Domain;
  readonly yDomain: Domain;
}
