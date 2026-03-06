/**
 * core/history.js
 * 操作历史（撤销/重做）— Command Pattern
 */

export function createHistory(maxSize = 50) {
  return { stack: [], cursor: -1, maxSize }
}

/**
 * 提交一个操作
 * command: { redo: (raster) => void, undo: (raster) => void, label: string }
 */
export function pushHistory(history, command) {
  // 丢弃 cursor 之后的历史
  history.stack = history.stack.slice(0, history.cursor + 1)
  history.stack.push(command)
  if (history.stack.length > history.maxSize) history.stack.shift()
  history.cursor = history.stack.length - 1
}

export function canUndo(history) {
  return history.cursor >= 0
}

export function canRedo(history) {
  return history.cursor < history.stack.length - 1
}

export function undo(history, ...args) {
  if (!canUndo(history)) return false
  history.stack[history.cursor].undo(...args)
  history.cursor--
  return true
}

export function redo(history, ...args) {
  if (!canRedo(history)) return false
  history.cursor++
  history.stack[history.cursor].redo(...args)
  return true
}

/**
 * 从 changed 数组（fillPolygon / paintBrush 的返回值）创建 Command
 * changed: [{ idx, old, labelId, oldSub?, subId? }, ...]
 * 当 changed 记录包含 oldSub/subId 时，同步撤销/重做子类数据
 */
export function changedToCommand(changed, label = '') {
  return {
    label,
    redo(raster, _dMap, subCatMap) {
      for (const c of changed) {
        raster.data[c.idx] = c.labelId
        if (subCatMap && c.subId !== undefined) subCatMap[c.idx] = c.subId
      }
    },
    undo(raster, _dMap, subCatMap) {
      for (const c of changed) {
        raster.data[c.idx] = c.old
        if (subCatMap && c.oldSub !== undefined) subCatMap[c.idx] = c.oldSub
      }
    },
  }
}
