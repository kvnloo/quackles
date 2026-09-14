"use client";

import { Component, type ReactNode } from "react";

type Props = {
  fallback: ReactNode;
  onError?: () => void;
  children: ReactNode;
};

type State = { failed: boolean };

export class CanvasGuard extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
