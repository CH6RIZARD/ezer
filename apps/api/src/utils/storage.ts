import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function ensureUploadsDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function saveFile(buffer: Buffer, extension: string): Promise<string> {
  const filename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(filepath, buffer);
  return filename;
}

export async function getFilePath(filename: string): Promise<string> {
  return path.join(UPLOAD_DIR, filename);
}

export async function deleteFile(filename: string): Promise<void> {
  const filepath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.unlink(filepath);
  } catch (error) {
    // File doesn't exist or already deleted
  }
}
