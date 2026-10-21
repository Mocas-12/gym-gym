// 恢复点放在 IndexedDB，避免在 localStorage 中再复制一整份训练历史。
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gym-gym-recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('backups')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('恢复点存储不可用，请先导出备份'))
  })
}

export async function writeRecovery(value) {
  const db = await database()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('backups', 'readwrite')
      tx.objectStore('backups').put(value, 'latest')
      tx.oncomplete = resolve
      tx.onabort = tx.onerror = () => reject(new Error('恢复点保存失败，原数据已保留'))
    })
  } finally {
    db.close()
  }
}

export async function readRecovery() {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('backups').objectStore('backups').get('latest')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('无法读取恢复点'))
    })
  } finally {
    db.close()
  }
}
