import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { LABELS } from '../core/raster.js'
import { buildRasterFromClusters } from '../core/raster.js'
import { rgbToHex } from '../core/kmeans.js'

export default function ClusterMapper() {
  const { clusters, imageData, setRaster, setClusterToLabel, setProcessing } = useStore()
  const [mapping, setMapping] = useState(() => {
    // 初始化时用颜色相似度做默认猜测
    if (!clusters) return []
    return clusters.centers.map(center => guessLabel(center))
  })

  const confirmMapping = async () => {
    setProcessing(true, '建立点阵数据模型...')
    await new Promise(r => setTimeout(r, 30))

    const { width, height } = imageData
    const raster = buildRasterFromClusters(width, height, clusters.assignments, mapping, 2)
    setClusterToLabel(mapping)
    setRaster(raster)
    setProcessing(false)
  }

  if (!clusters) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.headerIcon}>◈</span>
          <h2 style={styles.title}>颜色 → 标签 映射确认</h2>
        </div>
        <p style={styles.desc}>
          K-means 聚类检测到 {clusters.centers.length} 种主色调，请为每种颜色指定对应的用地类型。
        </p>

        <div style={styles.grid}>
          {clusters.centers.map((center, i) => (
            <div key={i} style={styles.row}>
              {/* 色块 */}
              <div style={{ ...styles.swatch, background: rgbToHex(center) }} />
              <div style={styles.rgbLabel}>
                {`RGB(${center[0]},${center[1]},${center[2]})`}
              </div>
              <span style={styles.arrow}>→</span>
              {/* 标签选择器 */}
              <select
                style={styles.select}
                value={mapping[i] ?? 0}
                onChange={(e) => {
                  const next = [...mapping]
                  next[i] = parseInt(e.target.value)
                  setMapping(next)
                }}
              >
                {LABELS.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {/* 标签色点 */}
              <div style={{ ...styles.labelDot, background: LABELS[mapping[i] ?? 0]?.color }} />
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button style={styles.confirmBtn} onClick={confirmMapping}>
            确认并建立底图 →
          </button>
        </div>
      </div>
    </div>
  )
}

// 根据 RGB 猜测最可能的标签
function guessLabel([r, g, b]) {
  const scores = [
    [0, 0], // 未分类 - fallback
    [1, Math.abs(r - 217) + Math.abs(g - 119) + Math.abs(b - 6)],     // 建筑
    [2, Math.abs(r - 156) + Math.abs(g - 163) + Math.abs(b - 175)],   // 道路
    [3, Math.abs(r - 22)  + Math.abs(g - 163) + Math.abs(b - 74)],    // 绿地
    [4, Math.abs(r - 37)  + Math.abs(g - 99)  + Math.abs(b - 235)],   // 水体
    [5, Math.abs(r - 202) + Math.abs(g - 138) + Math.abs(b - 4)],     // 农田
    [6, Math.abs(r - 180) + Math.abs(g - 83)  + Math.abs(b - 9)],     // 裸地
    [7, Math.abs(r - 124) + Math.abs(g - 58)  + Math.abs(b - 237)],   // 其他
  ]
  scores[0][1] = 9999
  return scores.reduce((best, cur) => cur[1] < best[1] ? cur : best)[0]
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: '#000000cc',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#0d1117',
    border: '1px solid #1e2d3d',
    borderRadius: '8px',
    padding: '32px',
    width: '520px',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 24px 80px #000000cc',
  },
  header: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  headerIcon: { color: '#22c55e', fontSize: '16px' },
  title: {
    margin: 0, fontFamily: "'Syne', sans-serif",
    fontSize: '16px', fontWeight: '700', color: '#f1f5f9',
  },
  desc: { fontSize: '12px', color: '#64748b', marginBottom: '24px', lineHeight: '1.6' },
  grid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '8px 12px',
    background: '#080d12',
    border: '1px solid #1e2d3d',
    borderRadius: '4px',
  },
  swatch: { width: '32px', height: '32px', borderRadius: '3px', flexShrink: 0, border: '1px solid #1e2d3d' },
  rgbLabel: { fontSize: '10px', color: '#475569', width: '130px', fontFamily: "'DM Mono', monospace" },
  arrow: { color: '#334155', fontSize: '14px' },
  select: {
    flex: 1, background: '#0d1117', border: '1px solid #1e2d3d',
    color: '#cbd5e1', padding: '6px 8px',
    fontSize: '12px', fontFamily: "'DM Mono', monospace",
    borderRadius: '3px', cursor: 'pointer', outline: 'none',
  },
  labelDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  footer: { marginTop: '24px', display: 'flex', justifyContent: 'flex-end' },
  confirmBtn: {
    padding: '10px 24px',
    background: '#22c55e',
    border: 'none', color: '#000',
    fontSize: '13px', fontFamily: "'DM Mono', monospace",
    fontWeight: '500', cursor: 'pointer', borderRadius: '4px',
    letterSpacing: '0.03em',
  },
}
