import { deleteDB, openDB, type IDBPDatabase } from 'idb'

interface IndexSpec {
  name: string
  unique?: boolean
}

interface StoreSpec {
  name: string
  keyPath: string
  indexes?: IndexSpec[]
}

interface IndexedDBOptions {
  stores: StoreSpec[]
  dbName: string
}

// Own copy of the framework-independent IndexedDB wrapper used by the Nuxt app's
// plugins/idb.js. web-react is a standalone project (no shared imports with the Nuxt app),
// so this class is copied here rather than referenced across projects.
export class IndexedDB {
  dbExists = false
  isBlocked = false
  dbName: string
  options: { upgrade(db: IDBPDatabase): void }
  db?: IDBPDatabase

  constructor({ stores, dbName }: IndexedDBOptions) {
    this.options = {
      upgrade(db) {
        Object.values(db.objectStoreNames).forEach((value) => {
          db.deleteObjectStore(value)
        })

        stores.forEach(({ name, keyPath, indexes }) => {
          const store = db.createObjectStore(name, {
            keyPath,
            autoIncrement: true
          })

          if (Array.isArray(indexes)) {
            indexes.forEach(({ name, unique = false }) => {
              store.createIndex(name, name, { unique })
            })
          }
        })
      }
    }

    this.dbName = dbName
  }

  async initDB(): Promise<boolean> {
    try {
      if (this.dbExists) {
        return true
      }

      this.isBlocked = false
      this.db = await openDB(this.dbName, 34, this.options)
      this.dbExists = true
      return true
    } catch (err: any) {
      if (err.message.includes('less than the existing version')) {
        return this._removeExist()
      }
      this.isBlocked = true
      // eslint-disable-next-line no-console
      console.error(`Method initDB has error: ${err.message}`)
      return false
    }
  }

  async _removeExist(): Promise<boolean> {
    try {
      await deleteDB(this.dbName)
      this.dbExists = false
      return this.initDB()
    } catch (err: any) {
      this.isBlocked = true
      // eslint-disable-next-line no-console
      console.error(`Method _removeExist has error: ${err.message}`)
      return false
    }
  }

  async getFromIndex(params: { storeName: string; indexName: string; key: unknown }) {
    if (this.isBlocked || !this.db) {
      return undefined
    }
    try {
      return await this.db.getFromIndex(params.storeName, params.indexName, params.key as IDBValidKey)
    } catch {
      return undefined
    }
  }

  async getAllFromIndex(params: { storeName: string; indexName: string; key?: unknown; count?: number }) {
    if (this.isBlocked || !this.db) {
      return []
    }
    try {
      return await this.db.getAllFromIndex(
        params.storeName,
        params.indexName,
        params.key as IDBValidKey,
        params.count
      )
    } catch {
      return []
    }
  }

  async getItem({ storeName, key }: { storeName: string; key: IDBValidKey }) {
    if (this.isBlocked || !this.db) {
      return undefined
    }
    const store = this.db.transaction(storeName).objectStore(storeName)
    return store.get(key)
  }

  async putItem({ storeName, data }: { storeName: string; data: unknown }) {
    if (this.isBlocked || !this.db) {
      return
    }
    const tx = this.db.transaction(storeName, 'readwrite')
    await tx.objectStore(storeName).put(data)
    await tx.done
  }

  async getAll({ storeName }: { storeName: string }) {
    if (this.isBlocked || !this.db) {
      return []
    }
    const tx = this.db.transaction(storeName, 'readonly')
    return tx.objectStore(storeName).getAll()
  }

  async clearStore({ storeName, mode = 'readwrite' }: { storeName: string; mode?: IDBTransactionMode }) {
    if (this.isBlocked || !this.db) {
      return
    }
    const tx = this.db.transaction(storeName, mode)
    await (tx.objectStore(storeName) as any).clear()
    await tx.done
  }

  async createTransactions({
    storeName,
    data,
    mode = 'readwrite'
  }: {
    storeName: string
    data: unknown
    mode?: IDBTransactionMode
  }) {
    if (this.isBlocked || !this.db) {
      return
    }
    const tx = this.db.transaction(storeName, mode)
    await (tx.objectStore(storeName) as any).add(data)
    await tx.done
  }

  async createMultipleTransactions({
    storeName,
    data,
    index,
    mode = 'readwrite'
  }: {
    storeName: string
    data: Array<Record<string, unknown>>
    index?: Record<string, unknown>
    mode?: IDBTransactionMode
  }) {
    if (this.isBlocked || !this.db) {
      return
    }
    const tx = this.db.transaction(storeName, mode)
    await Promise.all(data.filter(Boolean).map((item) => (tx.store as any).put({ ...item, ...index })))
    await tx.done
  }
}
