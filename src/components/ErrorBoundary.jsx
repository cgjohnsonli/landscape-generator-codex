import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || '未知渲染错误' }
  }

  componentDidCatch(error, info) {
    console.error('Render error captured by ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.root}>
          <div style={styles.card}>
            <h2 style={styles.title}>界面渲染异常</h2>
            <p style={styles.desc}>检测到页面渲染错误，已阻止白屏。请刷新页面或重新导入图像。</p>
            <pre style={styles.msg}>{this.state.message}</pre>
            <button style={styles.btn} onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const styles = {
  root: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#080d12',
    color: '#e2e8f0',
    padding: '24px',
  },
  card: {
    width: 'min(680px, 100%)',
    background: '#0d1117',
    border: '1px solid #1e2d3d',
    borderRadius: '8px',
    padding: '20px',
  },
  title: {
    margin: '0 0 8px',
    color: '#f87171',
    fontFamily: "'Syne', sans-serif",
  },
  desc: {
    margin: '0 0 12px',
    color: '#94a3b8',
    fontSize: '13px',
  },
  msg: {
    margin: '0 0 14px',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
    color: '#cbd5e1',
    background: '#080d12',
    border: '1px solid #1e2d3d',
    borderRadius: '4px',
    padding: '8px',
  },
  btn: {
    border: '1px solid #22c55e',
    background: 'transparent',
    color: '#22c55e',
    borderRadius: '4px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: "'DM Mono', monospace",
  },
}
