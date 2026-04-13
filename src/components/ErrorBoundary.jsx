import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', padding: '24px',
          fontFamily: "'Pretendard', sans-serif", background: '#fafafa',
        }}>
          <h2 style={{ fontSize: '20px', color: '#dc2626', marginBottom: '12px' }}>
            오류가 발생했습니다
          </h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px', textAlign: 'center' }}>
            {this.state.error?.message || '알 수 없는 오류'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 24px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '14px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
