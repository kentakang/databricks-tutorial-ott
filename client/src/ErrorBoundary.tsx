import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('SceneFlow client rendering failed.', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state">
          <div className="error-mark">!</div>
          <h2>화면을 다시 불러와 주세요</h2>
          <p>SceneFlow가 잠시 흐름을 놓쳤습니다.</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
