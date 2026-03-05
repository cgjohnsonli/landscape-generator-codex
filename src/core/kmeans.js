/**
 * core/kmeans.js
 * 纯前端 K-means 聚类，用于提取卫星图主色调
 */

/**
 * 对 ImageData 执行 K-means 聚类
 * @param {ImageData} imageData
 * @param {number} k 聚类数量
 * @param {number} maxIter 最大迭代次数
 * @param {number} sampleRate 采样率 0-1（大图加速）
 * @returns {{ centers: [r,g,b][], assignments: Uint8Array }}
 */
export async function kmeansImage(imageData, k = 8, maxIter = 20, sampleRate = 0.1) {
  const { data, width, height } = imageData
  const totalPixels = width * height

  // 1. 采样像素
  const sampleSize = Math.max(1000, Math.floor(totalPixels * sampleRate))
  const step = Math.max(1, Math.floor(totalPixels / sampleSize))
  const samples = []
  for (let i = 0; i < totalPixels; i += step) {
    const base = i * 4
    if (data[base + 3] > 10) { // skip transparent
      samples.push([data[base], data[base + 1], data[base + 2]])
    }
  }

  // 2. 初始化聚类中心（K-means++ 简化版）
  let centers = initCentersKMeansPP(samples, k)

  // 3. 迭代
  let assignments = new Uint8Array(samples.length)
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false

    // Assign
    for (let i = 0; i < samples.length; i++) {
      const nearest = nearestCenter(samples[i], centers)
      if (assignments[i] !== nearest) {
        assignments[i] = nearest
        changed = true
      }
    }
    if (!changed) break

    // Update centers
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]) // [r,g,b,count]
    for (let i = 0; i < samples.length; i++) {
      const c = assignments[i]
      sums[c][0] += samples[i][0]
      sums[c][1] += samples[i][1]
      sums[c][2] += samples[i][2]
      sums[c][3]++
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3]),
        ]
      }
    }
  }

  // 4. 为全图每个像素分配聚类（全量）
  const fullAssignments = new Uint8Array(totalPixels)
  for (let i = 0; i < totalPixels; i++) {
    const base = i * 4
    const pixel = [data[base], data[base + 1], data[base + 2]]
    fullAssignments[i] = nearestCenter(pixel, centers)
  }

  return { centers, assignments: fullAssignments }
}

function initCentersKMeansPP(samples, k) {
  const centers = []
  // 随机选第一个
  centers.push([...samples[Math.floor(Math.random() * samples.length)]])

  for (let c = 1; c < k; c++) {
    // 每个点到最近中心的距离平方
    const dists = samples.map(s => {
      let minD = Infinity
      for (const center of centers) minD = Math.min(minD, colorDist2(s, center))
      return minD
    })
    const total = dists.reduce((a, b) => a + b, 0)
    let rand = Math.random() * total
    let idx = 0
    for (let i = 0; i < dists.length; i++) {
      rand -= dists[i]
      if (rand <= 0) { idx = i; break }
    }
    centers.push([...samples[idx]])
  }
  return centers
}

function nearestCenter(pixel, centers) {
  let minDist = Infinity, best = 0
  for (let i = 0; i < centers.length; i++) {
    const d = colorDist2(pixel, centers[i])
    if (d < minDist) { minDist = d; best = i }
  }
  return best
}

function colorDist2(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

/**
 * 将 RGB 数组转为 hex 字符串
 */
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}
