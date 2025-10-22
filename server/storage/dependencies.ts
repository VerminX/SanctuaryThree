import { db } from "../db";
import {
  encryptDocumentContent,
  decryptDocumentContent,
  encryptSignatureData,
  decryptSignatureData,
} from "../services/encryption";

export interface StorageEncryption {
  encryptDocumentContent: typeof encryptDocumentContent;
  decryptDocumentContent: typeof decryptDocumentContent;
  encryptSignatureData: typeof encryptSignatureData;
  decryptSignatureData: typeof decryptSignatureData;
}

export interface StorageLogger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
}

export interface StorageDependencies {
  db: typeof db;
  encryption: StorageEncryption;
  logger: StorageLogger;
}

export const defaultStorageDependencies: StorageDependencies = {
  db,
  encryption: {
    encryptDocumentContent,
    decryptDocumentContent,
    encryptSignatureData,
    decryptSignatureData,
  },
  logger: console,
};
