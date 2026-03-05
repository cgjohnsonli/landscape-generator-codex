import React, { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore.js'
import { LABELS, paintBrush, fillPolygon } from '../core/raster.js'
import { changedToCommand, pushHistory } from '../core/history.js'
import { distToImageData } from '../core/analysis.js'

export default function MapCanvas() {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const {
    raster, sourceImage, renderTick, opacity,
    activeTool,
    designabilityMap,
    showDesignability,
    distMap, showAnalysis, analysisType,
    heatmapScale, heatmapGamma,
    layerSettings,
  } = useStore()

  const editState = useRef({
    isDrawing: false,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    originPanX: 0,
    originPanY: 0,
    polygonPoints: [],
    strokeChangedMap: new Map(),
  })

  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !raster) return
    const ctx = canvas.getContext('2d')

    canvas.width = raster.width
    canvas.height = raster.height

    const imgData = new ImageData(raster.width, raster.height)
    const { data } = imgData
    for (let i = 0; i < raster.data.length; i++) {
      const labelId = raster.data[i]
      const layer = layerSettings[labelId] ?? { visible: true }
      const [r, g, b] = LABELS[labelId]?.rgb ?? [100, 116, 139]
      const base = i * 4
      data[base] = r
      data[base + 1] = g
      data[base + 2] = b
      data[base + 3] = layer.visible ? 255 : 0
    }
    ctx.putImageData(imgData, 0, 0)

    if (sourceImage && opacity > 0) {
      ctx.globalAlpha = 1 - opacity
      ctx.drawImage(sourceImage, 0, 0, raster.width, raster.height)
      ctx.globalAlpha = 1
    }

    if (showAnalysis && distMap) {
      const baseMaxDist = analysisType === 'road' ? 300 / raster.cellSize : 500 / raster.cellSize
      const maxDist = Math.max(1, baseMaxDist * heatmapScale)
      const heatImgData = distToImageData(distMap, raster.width, raster.height, maxDist, heatmapGamma)
      ctx.putImageData(heatImgData, 0, 0)
    }

    if (showDesignability && designabilityMap) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'
      for (let i = 0; i < designabilityMap.length; i++) {
        if (designabilityMap[i] !== 1) continue
        const x = i % raster.width
        const y = Math.floor(i / raster.width)
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }, [raster, renderTick, opacity, showAnalysis, distMap, analysisType, heatmapScale, heatmapGamma, layerSettings, showDesignability, designabilityMap])

  useEffect(() => {
    const c = canvasRef.current
    const o = overlayRef.current
    if (!c || !o || !raster) return
    o.width = c.width
    o.height = c.height
  }, [raster])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [raster])

  const getCanvasPos = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ]
  }, [])

  const toRasterPixel = useCallback((v) => {
    const cellSize = useStore.getState().raster?.cellSize ?? 1
    return v * cellSize
  }, [])

  const commitBrushStroke = useCallback(() => {
    const changedMap = editState.current.strokeChangedMap
    if (!changedMap || changedMap.size === 0) return
    const first = changedMap.values().next().value
    const target = first?.target ?? 'landuse'
    const { history: hist } = useStore.getState()
    const changed = Array.from(changedMap.entries()).map(([idx, rec]) => ({ idx, old: rec.old, labelId: rec.labelId }))
    const command = target === 'designability'
      ? changedToDesignabilityCommand(changed, '可改笔刷')
      : changedToCommand(changed, '笔刷')
    pushHistory(hist, command)
    useStore.setState({ history: { ...hist } })
    changedMap.clear()
  }, [])

  const applyBrush = useCallback((px, py) => {
    const {
      raster: r,
      activeLabel: lbl,
      brushRadius: br,
      editTarget: target,
      designabilityPaintValue: paintValue,
      designabilityMap: dMap,
    } = useStore.getState()
    if (!r) return
    const scale = r.cellSize ?? 1
    const changed = target === 'designability'
      ? paintDesignability(dMap, r, px * scale, py * scale, br * scale, paintValue, (idx) => !(layerSettings[r.data[idx]]?.locked))
      : paintBrush(
        r,
        px * scale,
        py * scale,
        br * scale,
        lbl,
        (oldLabel) => !(layerSettings[oldLabel]?.locked),
      )
    if (changed.length === 0) return

    const changedMap = editState.current.strokeChangedMap
    for (const item of changed) {
      if (!changedMap.has(item.idx)) {
        changedMap.set(item.idx, { old: item.old, labelId: item.labelId, target })
      } else {
        changedMap.get(item.idx).labelId = item.labelId
      }
    }
    useStore.setState({ renderTick: useStore.getState().renderTick + 1 })
  }, [layerSettings])

  const drawPolygonPreview = useCallback((mouseX, mouseY) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const pts = editState.current.polygonPoints
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    if (pts.length === 0) return

    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (mouseX !== undefined) ctx.lineTo(mouseX, mouseY)
    ctx.strokeStyle = LABELS[useStore.getState().activeLabel]?.color ?? '#22c55e'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.stroke()

    ctx.setLineDash([])
    for (const pt of pts) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#22c55e'
      ctx.fill()
    }
  }, [])

  const finishPolygon = useCallback(() => {
    const pts = editState.current.polygonPoints
    if (pts.length < 3) return
    const {
      raster: r,
      activeLabel: lbl,
      history: hist,
      editTarget: target,
      designabilityPaintValue: paintValue,
      designabilityMap: dMap,
    } = useStore.getState()
    if (!r) return
    const rasterPts = pts.map(({ x, y }) => ({ x: toRasterPixel(x), y: toRasterPixel(y) }))
    const changed = target === 'designability'
      ? fillDesignability(dMap, r, rasterPts, paintValue, (idx) => !(layerSettings[r.data[idx]]?.locked))
      : fillPolygon(r, rasterPts, lbl, (oldLabel) => !(layerSettings[oldLabel]?.locked))
    if (changed.length > 0) {
      const command = target === 'designability'
        ? changedToDesignabilityCommand(changed, '可改多边形')
        : changedToCommand(changed, '多边形')
      pushHistory(hist, command)
      useStore.setState({ history: { ...hist }, renderTick: useStore.getState().renderTick + 1 })
    }
    editState.current.polygonPoints = []
    overlayRef.current?.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
  }, [toRasterPixel, layerSettings])

  const onMouseDown = useCallback((e) => {
    const [px, py] = getCanvasPos(e)

    // 中键（滚轮）强制平移
    if (e.button === 1) {
      e.preventDefault()
      editState.current.isPanning = true
      editState.current.panStartX = e.clientX
      editState.current.panStartY = e.clientY
      editState.current.originPanX = pan.x
      editState.current.originPanY = pan.y
      return
    }

    // 笔刷和多边形仅左键
    if (e.button !== 0) return

    const tool = useStore.getState().activeTool

    if (tool === 'pan') {
      editState.current.isPanning = true
      editState.current.panStartX = e.clientX
      editState.current.panStartY = e.clientY
      editState.current.originPanX = pan.x
      editState.current.originPanY = pan.y
      return
    }

    if (tool === 'brush') {
      editState.current.isDrawing = true
      editState.current.strokeChangedMap = new Map()
      applyBrush(px, py)
    } else if (tool === 'polygon') {
      const pts = editState.current.polygonPoints
      if (pts.length >= 3) {
        const first = pts[0]
        const dist = Math.hypot(px - first.x, py - first.y)
        if (dist < 12) {
          finishPolygon()
          return
        }
      }
      pts.push({ x: px, y: py })
      drawPolygonPreview(px, py)
    }
  }, [applyBrush, drawPolygonPreview, finishPolygon, getCanvasPos, pan.x, pan.y])

  const onMouseMove = useCallback((e) => {
    const [px, py] = getCanvasPos(e)

    if (editState.current.isPanning) {
      const dx = e.clientX - editState.current.panStartX
      const dy = e.clientY - editState.current.panStartY
      setPan({ x: editState.current.originPanX + dx, y: editState.current.originPanY + dy })
      return
    }

    const tool = useStore.getState().activeTool
    if (tool === 'brush' && editState.current.isDrawing) {
      applyBrush(px, py)
    } else if (tool === 'polygon') {
      drawPolygonPreview(px, py)
    }
    if (tool === 'brush') drawBrushCursor(px, py)
  }, [applyBrush, drawPolygonPreview, getCanvasPos])

  const onMouseUp = useCallback(() => {
    if (editState.current.isDrawing) {
      commitBrushStroke()
    }
    editState.current.isDrawing = false
    editState.current.isPanning = false
  }, [commitBrushStroke])

  const drawBrushCursor = (px, py) => {
    const overlay = overlayRef.current
    if (!overlay || useStore.getState().activeTool !== 'brush') return
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    const r = useStore.getState().brushRadius
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    const st = useStore.getState()
    ctx.strokeStyle = st.editTarget === 'designability'
      ? (st.designabilityPaintValue === 1 ? '#ef4444' : '#94a3b8')
      : (LABELS[st.activeLabel]?.color ?? '#22c55e')
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.stroke()
    ctx.setLineDash([])
  }

  const onMouseLeave = useCallback(() => {
    if (editState.current.isDrawing) commitBrushStroke()
    editState.current.isDrawing = false
    editState.current.isPanning = false
    const overlay = overlayRef.current
    if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
  }, [commitBrushStroke])

  const onDoubleClick = useCallback((e) => {
    if (e.button !== 0) return
    if (useStore.getState().activeTool !== 'polygon') return
    finishPolygon()
  }, [finishPolygon])

  const onWheelZoom = useCallback((e) => {
    e.preventDefault()
    const direction = e.deltaY < 0 ? 1 : -1
    const step = direction > 0 ? 1.1 : 0.9
    setZoom((prev) => {
      const next = prev * step
      return Math.min(8, Math.max(0.5, next))
    })
  }, [])

  const onDesignDragOver = useCallback((e) => {
    const st = useStore.getState()
    const hasPayload = e.dataTransfer.types.includes('application/x-greenlens-design')
    if (!st.showDesignability || !hasPayload) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDesignDrop = useCallback((e) => {
    const st = useStore.getState()
    if (!st.showDesignability) return
    const designId = e.dataTransfer.getData('application/x-greenlens-design')
    if (!designId) return
    e.preventDefault()

    const [px, py] = getCanvasPos(e)
    const applied = applyQuickDesign(st, px, py, designId, layerSettings)
    if (!applied) return
    const { history: hist } = useStore.getState()
    pushHistory(hist, changedToCommand(applied, `快速设计:${designId}`))
    useStore.setState({ history: { ...hist }, renderTick: useStore.getState().renderTick + 1 })
  }, [getCanvasPos, layerSettings])

  const cursorStyle = editState.current.isPanning
    ? 'grabbing'
    : activeTool === 'brush'
      ? 'none'
      : activeTool === 'polygon'
        ? 'crosshair'
        : 'grab'

  return (
    <div style={styles.root}>
      <div
        style={{
          ...styles.stage,
          width: raster?.width ?? 0,
          height: raster?.height ?? 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
        onWheel={onWheelZoom}
      >
        <canvas ref={canvasRef} style={styles.canvas} />
        <canvas
          ref={overlayRef}
          style={{ ...styles.canvas, ...styles.overlay, cursor: cursorStyle }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
          onDragOver={onDesignDragOver}
          onDrop={onDesignDrop}
        />
      </div>
      <div style={styles.zoomBadge}>缩放 {Math.round(zoom * 100)}%</div>
    </div>
  )
}


function changedToDesignabilityCommand(changed, label = '') {
  return {
    label,
    redo(_raster, designabilityMap) {
      if (!designabilityMap) return
      for (const { idx, labelId } of changed) designabilityMap[idx] = labelId
    },
    undo(_raster, designabilityMap) {
      if (!designabilityMap) return
      for (const { idx, old } of changed) designabilityMap[idx] = old
    },
  }
}

function paintDesignability(map, raster, px, py, radiusPx, value, canEditIdx = () => true) {
  if (!map) return []
  const changed = []
  const r2 = radiusPx * radiusPx
  const cs = raster.cellSize
  const minCol = Math.max(0, Math.floor((px - radiusPx) / cs))
  const maxCol = Math.min(raster.width - 1, Math.ceil((px + radiusPx) / cs))
  const minRow = Math.max(0, Math.floor((py - radiusPx) / cs))
  const maxRow = Math.min(raster.height - 1, Math.ceil((py + radiusPx) / cs))

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cx = (col + 0.5) * cs
      const cy = (row + 0.5) * cs
      const dx = cx - px
      const dy = cy - py
      if (dx * dx + dy * dy > r2) continue
      const idx = row * raster.width + col
      const old = map[idx]
      if (old === value || !canEditIdx(idx)) continue
      map[idx] = value
      changed.push({ idx, old, labelId: value })
    }
  }
  return changed
}

function fillDesignability(map, raster, polygonPx, value, canEditIdx = () => true) {
  if (!map || polygonPx.length < 3) return []
  const changed = []
  const xs = polygonPx.map(p => p.x)
  const ys = polygonPx.map(p => p.y)
  const minCol = Math.max(0, Math.floor(Math.min(...xs) / raster.cellSize))
  const maxCol = Math.min(raster.width - 1, Math.ceil(Math.max(...xs) / raster.cellSize))
  const minRow = Math.max(0, Math.floor(Math.min(...ys) / raster.cellSize))
  const maxRow = Math.min(raster.height - 1, Math.ceil(Math.max(...ys) / raster.cellSize))

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cx = (col + 0.5) * raster.cellSize
      const cy = (row + 0.5) * raster.cellSize
      if (!pointInPolygon(cx, cy, polygonPx)) continue
      const idx = row * raster.width + col
      const old = map[idx]
      if (old === value || !canEditIdx(idx)) continue
      map[idx] = value
      changed.push({ idx, old, labelId: value })
    }
  }
  return changed
}

function pointInPolygon(x, y, polygon) {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}


function applyQuickDesign(state, px, py, designId, layerSettings) {
  const { raster, designabilityMap } = state
  if (!raster || !designabilityMap) return null
  const col = Math.floor(px)
  const row = Math.floor(py)
  if (col < 0 || row < 0 || col >= raster.width || row >= raster.height) return null
  const startIdx = row * raster.width + col
  if (designabilityMap[startIdx] !== 1) return null

  const region = floodDesignableRegion(raster.width, raster.height, designabilityMap, startIdx)
  if (region.length === 0) return null

  const changed = []
  const minCol = region.reduce((m, idx) => Math.min(m, idx % raster.width), Infinity)
  const minRow = region.reduce((m, idx) => Math.min(m, Math.floor(idx / raster.width)), Infinity)

  for (const idx of region) {
    const old = raster.data[idx]
    if (layerSettings[old]?.locked) continue
    const col0 = idx % raster.width
    const row0 = Math.floor(idx / raster.width)
    const relX = col0 - minCol
    const relY = row0 - minRow
    const labelId = pickQuickDesignLabel(designId, relX, relY)
    if (labelId === old) continue
    raster.data[idx] = labelId
    changed.push({ idx, old, labelId })
  }

  return changed
}

function floodDesignableRegion(width, height, map, startIdx) {
  const out = []
  const seen = new Uint8Array(width * height)
  const q = [startIdx]
  seen[startIdx] = 1

  while (q.length) {
    const idx = q.pop()
    if (map[idx] !== 1) continue
    out.push(idx)
    const c = idx % width
    const r = Math.floor(idx / width)
    const nbs = []
    if (c > 0) nbs.push(idx - 1)
    if (c < width - 1) nbs.push(idx + 1)
    if (r > 0) nbs.push(idx - width)
    if (r < height - 1) nbs.push(idx + width)
    for (const n of nbs) {
      if (seen[n]) continue
      seen[n] = 1
      q.push(n)
    }
  }
  return out
}

function pickQuickDesignLabel(designId, x, y) {
  // 3=绿地/植被, 8=硬质铺装
  if (designId === 'pocket_park') {
    return (x % 6 === 0 || y % 6 === 0) ? 8 : 3
  }
  if (designId === 'civic_plaza') {
    return ((x + y) % 7 <= 1) ? 3 : 8
  }
  if (designId === 'urban_forest') {
    return ((x % 10 === 0) && (y % 3 === 0)) ? 8 : 3
  }
  return 3
}

const styles = {
  root: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#080d12',
  },
  stage: {
    position: 'relative',
    transformOrigin: 'center center',
  },
  canvas: {
    position: 'absolute',
    maxWidth: '100%',
    maxHeight: '100%',
    imageRendering: 'pixelated',
    objectFit: 'contain',
  },
  overlay: {
    pointerEvents: 'all',
    background: 'transparent',
  },
  zoomBadge: {
    position: 'absolute',
    right: '12px',
    bottom: '12px',
    padding: '4px 8px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid #334155',
    color: '#cbd5e1',
    background: '#0d1117cc',
    pointerEvents: 'none',
  },
}
