import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { StoredUser } from './auth.types';

interface PersistedData {
  users: StoredUser[];
}

const DEFAULT_DATA: PersistedData = {
  users: [],
};

@Injectable()
export class StorageService {
  private readonly dataPath = join(process.cwd(), 'data', 'app-data.json');

  async read(): Promise<PersistedData> {
    await this.ensureFile();
    const raw = await readFile(this.dataPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedData>;

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
    };
  }

  async write(data: PersistedData): Promise<void> {
    await this.ensureFile();
    await writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async ensureFile(): Promise<void> {
    await mkdir(dirname(this.dataPath), { recursive: true });

    try {
      await readFile(this.dataPath, 'utf-8');
    } catch {
      await writeFile(this.dataPath, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
    }
  }
}
