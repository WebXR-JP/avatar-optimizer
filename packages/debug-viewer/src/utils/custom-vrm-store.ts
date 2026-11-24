/**
 * ストレステスト用のカスタム VRM を IndexedDB に保存する
 *
 * レンダラーの切り替えはページ再読み込みになるため、アップロードした
 * ファイルをそのままでは失う。直近 1 ファイルだけブラウザ内に保存し、
 * 再読み込み時に復元する。保存に失敗しても（容量不足など）機能自体は動く。
 */

const DB_NAME = 'debug-viewer-stress'
const STORE_NAME = 'custom-vrm'
const RECORD_KEY = 'current'

export interface StoredCustomVRM
{
  name: string
  size: number
  lastModified: number
  buffer: ArrayBuffer
}

function openDatabase(): Promise<IDBDatabase | null>
{
  return new Promise((resolve) =>
  {
    try
    {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () =>
      {
        request.result.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    }
    catch
    {
      resolve(null)
    }
  })
}

/** カスタム VRM を保存する（保存できたかを返す） */
export async function saveCustomVRM(value: StoredCustomVRM): Promise<boolean>
{
  const db = await openDatabase()
  if (!db) return false

  try
  {
    await new Promise<void>((resolve, reject) =>
    {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return true
  }
  catch
  {
    return false
  }
  finally
  {
    db.close()
  }
}

/** 保存済みのカスタム VRM を読み出す（無ければ null） */
export async function loadCustomVRM(): Promise<StoredCustomVRM | null>
{
  const db = await openDatabase()
  if (!db) return null

  try
  {
    return await new Promise<StoredCustomVRM | null>((resolve) =>
    {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY)
      request.onsuccess = () =>
      {
        const value = request.result as StoredCustomVRM | undefined
        resolve(value && value.buffer instanceof ArrayBuffer ? value : null)
      }
      request.onerror = () => resolve(null)
    })
  }
  finally
  {
    db.close()
  }
}

/** 保存済みのカスタム VRM を削除する */
export async function clearCustomVRM(): Promise<void>
{
  const db = await openDatabase()
  if (!db) return

  try
  {
    await new Promise<void>((resolve) =>
    {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  }
  finally
  {
    db.close()
  }
}
