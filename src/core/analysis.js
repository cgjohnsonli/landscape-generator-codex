/**
 * core/analysis.js
 * 空间分析算法 — 绿地服务圈 / 可达性
 */

import { LABELS } from './raster.js'

/**
 * 绿地服务圈：以绿地格元为源，BFS 计算欧式距离，返回每个格元到最近绿地的距离（格元数）
 * @param {RasterGrid} raster
 * @param {number} targetLabelId 默认 3（绿地）
 * @returns {Float32Array} dist — -1 表示不可达
 */
export function greenServiceDistance(raster, targetLabelId = 3) {
  const { width, height, data } = raster
  const dist = new Float32Array(width * height).fill(-1)
  const queue = []

  // 初始化：所有绿地格元距离为 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] === targetLabelId) {
      dist[i] = 0
      queue.push(i)
    }
  }

  const dx = [1, -1, 0, 0, 1, -1, 1, -1]
  const dy = [0, 0, 1, -1, 1, -1, -1, 1]
  const dd = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]

  // BFS
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const row = Math.floor(idx / width)
    const col = idx % width
    const d = dist[idx]

    for (let dir = 0; dir < 8; dir++) {
      const nc = col + dx[dir]
      const nr = row + dy[dir]
      if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
      const ni = nr * width + nc
      const nd = d + dd[dir]
      if (dist[ni] === -1 || dist[ni] > nd) {
        dist[ni] = nd
        queue.push(ni)
      }
    }
  }

  return dist
}

/**
 * 道路可达性：到最近道路格元的距离（格元数）
 */
export function roadServiceDistance(raster, roadLabelId = 2) {
  return greenServiceDistance(raster, roadLabelId)
}

/**
 * 根据距离图生成覆盖统计
 * @param {Float32Array} dist
 * @param {number} cellSizeM 格元实际尺寸（米）
 * @param {number[]} thresholds 距离阈值（米）[300, 500, 1000]
 * @returns {{ threshold, coveredCells, totalCells, percent }[]}
 */
export function coverageStats(dist, cellSizeM, thresholds = [300, 500, 1000]) {
  const totalCells = dist.length
  return thresholds.map(t => {
    const cellThreshold = t / cellSizeM
    let covered = 0
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] >= 0 && dist[i] <= cellThreshold) covered++
    }
    return {
      threshold: t,
      coveredCells: covered,
      totalCells,
      percent: ((covered / totalCells) * 100).toFixed(1),
    }
  })
}

/**
 * 将距离图渲染为 ImageData（热力图色彩：绿→黄→红→灰）
 */
export function distToImageData(dist, width, height, maxDist, gamma = 0.7) {
  const imgData = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < dist.length; i++) {
    const base = i * 4
    const d = dist[i]
    if (d < 0) {
      imgData[base] = 0; imgData[base+1] = 0; imgData[base+2] = 0; imgData[base+3] = 0
      continue
    }
    const normalized = Math.min(d / maxDist, 1)
    const t = Math.pow(normalized, gamma)
    const [r, g, b] = heatColor(t)
    imgData[base] = r; imgData[base+1] = g; imgData[base+2] = b; imgData[base+3] = 180
  }
  return new ImageData(imgData, width, height)
}

function heatColor(t) {
  // 0 = 绿色，0.5 = 黄色，1 = 红色
  if (t < 0.5) {
    const s = t * 2
    return [Math.round(255 * s), 200, Math.round(50 * (1 - s))]
  } else {
    const s = (t - 0.5) * 2
    return [220, Math.round(200 * (1 - s)), 0]
  }
}

/**
 * 生成绿地更新建议（基于规则）
 */
export function generateSuggestions(raster, distMap) {
  const { width, height, data, cellSize } = raster
  const totalCells = width * height
  let greenCells = 0, buildingCells = 0, uncoveredBuildingCells = 0

  for (let i = 0; i < data.length; i++) {
    if (data[i] === 3) greenCells++
    if (data[i] === 1) {
      buildingCells++
      if (distMap && (distMap[i] < 0 || distMap[i] > 500 / cellSize)) uncoveredBuildingCells++
    }
  }

  const greenRatio = (greenCells / totalCells * 100).toFixed(1)
  const uncoveredRatio = buildingCells > 0
    ? (uncoveredBuildingCells / buildingCells * 100).toFixed(1)
    : '0.0'

  const suggestions = []

  if (parseFloat(greenRatio) < 30) {
    suggestions.push({
      level: 'warning',
      title: '绿地覆盖率偏低',
      text: `当前绿地占比 ${greenRatio}%，低于城市规划推荐值 30%。建议在裸地或低效用地区域补种绿化。`,
    })
  } else {
    suggestions.push({
      level: 'ok',
      title: '绿地覆盖率达标',
      text: `绿地占比 ${greenRatio}%，达到推荐标准。`,
    })
  }

  if (parseFloat(uncoveredRatio) > 20) {
    suggestions.push({
      level: 'warning',
      title: '建筑用地绿化服务不足',
      text: `${uncoveredRatio}% 的建筑用地超出 500 m 绿地服务圈。建议在服务盲区增设口袋公园或街道绿化节点。`,
    })
  }

  if (greenCells === 0) {
    suggestions.push({
      level: 'error',
      title: '未检测到绿地',
      text: '请先在地图上标注绿地区域，再运行分析。',
    })
  }

  return { greenRatio, uncoveredRatio, suggestions }
}


/**
 * 生成道路可达性建议（基于规则）
 */
export function generateRoadSuggestions(raster, distMap) {
  const { data, cellSize } = raster
  let buildingCells = 0
  let farBuildingCells = 0

  for (let i = 0; i < data.length; i++) {
    if (data[i] === 1) {
      buildingCells++
      if (distMap && (distMap[i] < 0 || distMap[i] > 300 / cellSize)) farBuildingCells++
    }
  }

  const farRatio = buildingCells > 0 ? (farBuildingCells / buildingCells * 100).toFixed(1) : '0.0'
  const suggestions = []

  if (buildingCells === 0) {
    suggestions.push({
      level: 'warning',
      title: '未检测到建筑用地',
      text: '当前样本中未检测到建筑用地，无法评估道路服务覆盖。',
    })
  } else if (parseFloat(farRatio) > 25) {
    suggestions.push({
      level: 'warning',
      title: '道路服务覆盖偏弱',
      text: `${farRatio}% 的建筑用地距离道路超过 300m，建议优化支路连通或增设慢行通道。`,
    })
  } else {
    suggestions.push({
      level: 'ok',
      title: '道路服务覆盖良好',
      text: `建筑用地中仅 ${farRatio}% 超过 300m，道路可达性整体较好。`,
    })
  }

  return { farRatio, suggestions }
}
