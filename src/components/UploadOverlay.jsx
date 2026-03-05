import { useRef, useCallback } from 'react'
import { useStore } from '../store/useStore.js'
import { kmeansImage } from '../core/kmeans.js'

export default function UploadOverlay() {
  const { setSourceImage, setClusters, setProcessing, setClusterToLabel } = useStore()
  const inputRef = useRef()
  const dragRef = useRef(false)

  const processFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return

    setProcessing(true, '读取图像...')

    const bitmap = await createImageBitmap(file)
    const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = offscreen.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

    // 创建用于展示的 img element
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await new Promise(r => img.onload = r)

    setSourceImage(img, imageData, file.name)
    setProcessing(true, `K-means 聚类中（${bitmap.width}×${bitmap.height}px）...`)

    // 延迟执行让 UI 更新
    await new Promise(r => setTimeout(r, 50))
    const clusters = await kmeansImage(imageData, 8, 25, 0.15)
    setClusters(clusters)
    setProcessing(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    dragRef.current = false
    const file = e.dataTransfer.files[0]
    processFile(file)
  }, [processFile])

  const onDragOver = (e) => { e.preventDefault(); dragRef.current = true }

  return (
    <div style={styles.root}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => dragRef.current = false}
    >
      {/* Grid background */}
      <div style={styles.grid} />

      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="4" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3"/>
            <path d="M24 16 L24 32 M16 24 L24 16 L32 24" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 style={styles.title}>导入分色图</h2>
        <p style={styles.desc}>
          拖放 PNG / JPG 分色卫星图到此处<br/>
          系统将自动进行 K-means 聚类分析
        </p>
        <button style={styles.btn} onClick={() => inputRef.current?.click()}>
          选择文件
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          style={{ display: 'none' }}
          onChange={(e) => processFile(e.target.files?.[0])}
        />
        <p style={styles.hint}>推荐分辨率：500×500 ~ 4000×4000 px</p>
      </div>
    </div>
  )
}

const styles = {
  root: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#080d12',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(#1e2d3d22 1px, transparent 1px), linear-gradient(90deg, #1e2d3d22 1px, transparent 1px)',
    backgroundSize: '40px 40px',
  },
  card: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '16px',
    padding: '48px 56px',
    background: '#0d1117',
    border: '1px solid #1e2d3d',
    borderRadius: '8px',
    boxShadow: '0 0 60px #22c55e08',
  },
  iconWrap: { marginBottom: '8px' },
  title: {
    margin: 0,
    fontFamily: "'Syne', sans-serif",
    fontSize: '22px', fontWeight: '700',
    color: '#f1f5f9',
  },
  desc: {
    margin: 0, textAlign: 'center',
    fontSize: '13px', lineHeight: '1.8',
    color: '#64748b',
  },
  btn: {
    padding: '10px 28px',
    background: 'transparent',
    border: '1px solid #22c55e',
    color: '#22c55e',
    fontSize: '13px',
    fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.05em',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'all 0.15s',
  },
  hint: {
    margin: 0,
    fontSize: '11px',
    color: '#334155',
    letterSpacing: '0.05em',
  },
}
