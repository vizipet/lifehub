export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorePrivateFileInput {
  path: string;
  data: Buffer;
  contentType: string;
}

export interface StorageService {
  uploadPrivate(input: StorePrivateFileInput): Promise<void>;

  /** Lê o arquivo privado. Só deve ser chamado depois da autorização. */
  read(path: string): Promise<Buffer>;

  remove(path: string): Promise<void>;
}
