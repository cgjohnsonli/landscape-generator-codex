import React, { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { LABELS, ACTIVE_LABELS, buildRasterFromClusters, hasSubCategories, getSubCategories } from '../core/raster.js'
import { rgbToHex } from '../core/kmeans.js'

export default function ClusterMapper() {
  const { clusters, imageData, sourceImage, setRaster, setClusterToLabel, setProcessing } = useStore()
  const previewCanvasRef = useRef(null)

  const [mapping, setMapping] = React.useState(() => {
    // 初始化时用颜色相似度做默认猜测
    if (!clusters) return []
    return clusters.centers.map(center => guessLabel(center))
  })
  const [mappingMode, setMappingMode] = React.useState('primary') // 'primary' | 'subcategory'
  const [subMapping, setSubMapping] = React.useState(() =>
    clusters ? clusters.centers.map(() => 0) : []
  )

  const previewRaster = useMemo(() => {
    if (!clusters || !imageData) return null
    return buildRasterFromClusters(imageData.width, imageData.height, clusters.assignments, mapping, 2)
  }, [clusters, imageData, mapping])

  useEffect(() => {
    if (!previewRaster) return
    const canvas = previewCanvasRef.current
    if (!canvas) return

    canvas.width = previewRaster.width
    canvas.height = previewRaster.height
    const ctx = canvas.getContext('2d')

    const imgData = new ImageData(previewRaster.width, previewRaster.height)
    const { data } = imgData

    for (let i = 0; i < previewRaster.data.length; i++) {
      const labelId = previewRaster.data[i]
      const [r, g, b] = LABELS[labelId]?.rgb ?? [100, 116, 139]
      const base = i * 4
      data[base] = r
      data[base + 1] = g
      data[base + 2] = b
      data[base + 3] = 255
    }

    ctx.putImageData(imgData, 0, 0)

    // 叠加原图，方便用户理解映射结果落在什么区域
    if (sourceImage) {
      ctx.globalAlpha = 0.35
      ctx.drawImage(sourceImage, 0, 0, previewRaster.width, previewRaster.height)
      ctx.globalAlpha = 1
    }
  }, [previewRaster, sourceImage])

  const confirmMapping = async () => {
    if (!clusters || !imageData) {
      alert('映射数据不完整，请重新上传图像后再试。')
      return
    }

    setProcessing(true, '建立点阵数据模型...')
    try {
      await new Promise(r => setTimeout(r, 30))
      const nextRaster = buildRasterFromClusters(
        imageData.width,
        imageData.height,
        clusters.assignments,
        mapping,
        2,
      )

      if (!nextRaster?.width || !nextRaster?.height || !nextRaster?.data?.length) {
        throw new Error('点阵数据为空')
      }

      setClusterToLabel(mapping)
      setRaster(nextRaster)

      // 子类映射模式下，根据聚类分配生成 subCategoryMap
      if (mappingMode === 'subcategory') {
        const scMap = new Uint8Array(nextRaster.width * nextRaster.height)
        for (let row = 0; row < nextRaster.height; row++) {
          for (let col = 0; col < nextRaster.width; col++) {
            const px = Math.min(col * 2, imageData.width - 1)
            const py = Math.min(row * 2, imageData.height - 1)
            const pixelIdx = py * imageData.width + px
            const clusterId = clusters.assignments[pixelIdx]
            scMap[row * nextRaster.width + col] = subMapping[clusterId] ?? 0
          }
        }
        useStore.setState({ subCategoryMap: scMap })
      }
    } catch (e) {
      alert(`建立底图失败：${e.message || '未知错误'}`)
    } finally {
      setProcessing(false)
    }
  }

  if (!clusters) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.previewBackdrop}>
        <canvas ref={previewCanvasRef} style={styles.previewCanvas} />
        <div style={styles.previewHint}>实时预览：调整右侧标签映射时，此图会同步更新</div>
      </div>

      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.headerIcon}>◈</span>
          <h2 style={styles.title}>颜色 → 标签 映射确认</h2>
        </div>
        <p style={styles.desc}>
          K-means 聚类检测到 {clusters.centers.length} 种主色调，请为每种颜色指定对应的用地类型。
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            style={{ ...styles.modeBtn, ...(mappingMode === 'primary' ? styles.modeBtnActive : {}) }}
            onClick={() => setMappingMode('primary')}
          >
            主类映射
          </button>
          <button
            style={{ ...styles.modeBtn, ...(mappingMode === 'subcategory' ? styles.modeBtnActive : {}) }}
            onClick={() => setMappingMode('subcategory')}
          >
            子类映射
          </button>
        </div>

        <div style={styles.grid}>
          {clusters.centers.map((center, i) => (
            <div key={i} style={styles.row}>
              <div style={{ ...styles.swatch, background: rgbToHex(center) }} />
              <div style={styles.rgbLabel}>
                {`RGB(${center[0]},${center[1]},${center[2]})`}
              </div>
              <span style={styles.arrow}>→</span>
              <select
                style={styles.select}
                value={mapping[i] ?? 0}
                onChange={(e) => {
                  const next = [...mapping]
                  next[i] = parseInt(e.target.value)
                  setMapping(next)
                  // 切换主类时重置子类
                  const nextSub = [...subMapping]
                  nextSub[i] = 0
                  setSubMapping(nextSub)
                }}
              >
                {ACTIVE_LABELS.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {mappingMode === 'subcategory' && hasSubCategories(mapping[i]) && (
                <select
                  style={{ ...styles.select, maxWidth: '90px' }}
                  value={subMapping[i] ?? 0}
                  onChange={(e) => {
                    const next = [...subMapping]
                    next[i] = parseInt(e.target.value)
                    setSubMapping(next)
                  }}
                >
                  {getSubCategories(mapping[i]).map(sc => (
                    <option key={sc.subId} value={sc.subId}>{sc.name}</option>
                  ))}
                </select>
              )}
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

function guessLabel([r, g, b]) {
  let best = [0, 9999]
  for (const l of ACTIVE_LABELS) {
    if (l.id === 0) continue // 跳过未分类
    const [lr, lg, lb] = l.rgb
    const dist = Math.abs(r - lr) + Math.abs(g - lg) + Math.abs(b - lb)
    if (dist < best[1]) best = [l.id, dist]
  }
  return best[0]
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: '#000000b3',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
    padding: '24px',
  },
  previewBackdrop: {
    position: 'absolute',
    inset: '24px 600px 24px 24px',
    border: '1px solid #1e2d3d',
    borderRadius: '8px',
    background: '#080d12',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewCanvas: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  },
  previewHint: {
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    fontSize: '11px',
    color: '#cbd5e1',
    background: '#0d1117cc',
    border: '1px solid #334155',
    borderRadius: '4px',
    padding: '6px 8px',
  },
  modal: {
    marginLeft: 'auto',
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
  modeBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #1e2d3d',
    color: '#64748b',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    borderRadius: '3px',
    cursor: 'pointer',
  },
  modeBtnActive: {
    borderColor: '#22c55e',
    color: '#22c55e',
    background: '#22c55e11',
  },
}
