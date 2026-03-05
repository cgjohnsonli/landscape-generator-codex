/**
 * core/raster.js
 * 点阵数据模型 — RasterGrid
 * 
 * data: Uint8Array, 每个元素是一个标签 ID (0-255)
 * 索引: row * width + col
 */

export const LABELS = [
  { id: 0, name: '未分类',     color: '#64748b', rgb: [100, 116, 139] },
  { id: 1, name: '建筑',       color: '#d97706', rgb: [217, 119,   6] },
  { id: 2, name: '道路/硬质',  color: '#9ca3af', rgb: [156, 163, 175] },
  { id: 3, name: '绿地/植被',  color: '#16a34a', rgb: [ 22, 163,  74] },
  { id: 4, name: '水体',       color: '#2563eb', rgb: [ 37,  99, 235] },
  { id: 5, name: '农田',       color: '#ca8a04', rgb: [202, 138,   4] },
  { id: 6, name: '裸地',       color: '#b45309', rgb: [180,  83,   9] },
  { id: 7, name: '其他用地',   color: '#7c3aed', rgb: [124,  58, 237] },
]

export const LABEL_MAP = Object.fromEntries(LABELS.map(l => [l.id, l]))

/**
 * 创建空的 RasterGrid
 */
export function createRaster(width, height, cellSize = 2) {
  return {
    width,
    height,
    cellSize,
    data: new Uint8Array(width * height), // all zeros = 未分类
  }
}

/**
 * 从 ImageData 构建 RasterGrid
 * clusterAssignments: 每像素 → 聚类 ID (0..k-1)
 * clusterToLabel: 聚类 ID → 标签 ID 的映射数组
 */
export function buildRasterFromClusters(imgWidth, imgHeight, clusterAssignments, clusterToLabel, cellSize = 1) {
  const cols = Math.ceil(imgWidth / cellSize)
  const rows = Math.ceil(imgHeight / cellSize)
  const data = new Uint8Array(cols * rows)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 取格元左上角像素的聚类
      const px = Math.min(c * cellSize, imgWidth - 1)
      const py = Math.min(r * cellSize, imgHeight - 1)
      const pixelIdx = py * imgWidth + px
      const clusterId = clusterAssignments[pixelIdx]
      data[r * cols + c] = clusterToLabel[clusterId] ?? 0
    }
  }

  return { width: cols, height: rows, cellSize, data }
}

/**
 * 获取/设置单个格元标签
 */
export function getCell(raster, col, row) {
  if (col < 0 || row < 0 || col >= raster.width || row >= raster.height) return -1
  return raster.data[row * raster.width + col]
}

export function setCell(raster, col, row, labelId) {
  if (col < 0 || row < 0 || col >= raster.width || row >= raster.height) return
  raster.data[row * raster.width + col] = labelId
}

/**
 * 将像素坐标转换为格元坐标
 */
export function pixelToCell(raster, px, py) {
  return {
    col: Math.floor(px / raster.cellSize),
    row: Math.floor(py / raster.cellSize),
  }
}

/**
 * 统计各标签面积（格元数量）
 */
export function computeStats(raster) {
  const counts = new Array(LABELS.length).fill(0)
  for (let i = 0; i < raster.data.length; i++) {
    counts[raster.data[i]]++
  }
  const total = raster.width * raster.height
  return LABELS.map((l, i) => ({
    ...l,
    cells: counts[i],
    percent: total > 0 ? ((counts[i] / total) * 100).toFixed(1) : '0.0',
  }))
}

/**
 * 多边形内的格元批量更新
 * polygon: [{x, y}, ...] 像素坐标（相对于 canvas）
 */
export function fillPolygon(raster, polygonPx, labelId) {
  if (polygonPx.length < 3) return []
  const changed = []

  // Bounding box
  const xs = polygonPx.map(p => p.x)
  const ys = polygonPx.map(p => p.y)
  const minCol = Math.max(0, Math.floor(Math.min(...xs) / raster.cellSize))
  const maxCol = Math.min(raster.width - 1, Math.ceil(Math.max(...xs) / raster.cellSize))
  const minRow = Math.max(0, Math.floor(Math.min(...ys) / raster.cellSize))
  const maxRow = Math.min(raster.height - 1, Math.ceil(Math.max(...ys) / raster.cellSize))

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cx = (c + 0.5) * raster.cellSize
      const cy = (r + 0.5) * raster.cellSize
      if (pointInPolygon(cx, cy, polygonPx)) {
        const idx = r * raster.width + c
        const old = raster.data[idx]
        if (old !== labelId) {
          changed.push({ idx, old, labelId })
          raster.data[idx] = labelId
        }
      }
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

/**
 * 笔刷涂抹：以 (px, py) 为中心，radius 为半径的圆形区域
 */
export function paintBrush(raster, px, py, radiusPx, labelId) {
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
      const dx = cx - px, dy = cy - py
      if (dx * dx + dy * dy <= r2) {
        const idx = row * raster.width + col
        const old = raster.data[idx]
        if (old !== labelId) {
          changed.push({ idx, old, labelId })
          raster.data[idx] = labelId
        }
      }
    }
  }
  return changed
}
