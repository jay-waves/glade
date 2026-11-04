import React from 'react';

// Rendering failures are separate from media/network errors handled by the player.
export class PlayerErrorBoundary extends React.Component {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch(error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}
