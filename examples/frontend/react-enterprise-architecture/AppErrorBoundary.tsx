import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Telemetry } from "./types.js";

export class AppErrorBoundary extends Component<
  { readonly telemetry: Telemetry; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.telemetry.error(error, {
      boundary: "react-widget",
      componentStack: info.componentStack ?? "unavailable",
    });
  }

  render() {
    if (this.state.failed) {
      return <p role="alert">模块暂时不可用，请刷新后重试。</p>;
    }
    return this.props.children;
  }
}
