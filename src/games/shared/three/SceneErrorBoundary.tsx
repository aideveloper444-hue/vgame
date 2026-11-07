import { Component, type ReactNode } from 'react'

/**
 * Contains asset-load failures (a model, texture or HDR that 404s or times out) to the 3D subtree
 * that needed it. Without this, one failed download unmounts the whole game screen.
 */
export default class SceneErrorBoundary extends Component<{ children: ReactNode; label?: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`[scene] ${this.props.label ?? 'subtree'} failed to load and was skipped:`, error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
