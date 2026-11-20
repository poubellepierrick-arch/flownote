import {
  extractZipEntries,
  parseNotionEntries,
  type NotionImportResult,
  type NotionTextEntry,
} from './notionImporter';

interface FileWithRelativePath {
  file: File;
  path: string;
}

const SUPPORTED_TEXT_RE = /\.(md|markdown|csv|txt|html|htm)$/i;
const IGNORED_SYSTEM_FILE_RE = /(?:^|\/)(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

function isIgnoredSystemPath(path: string): boolean {
  return (
    path.startsWith('__MACOSX/') ||
    path.split('/').some((seg) => seg.startsWith('.')) ||
    IGNORED_SYSTEM_FILE_RE.test(path)
  );
}

async function processCollectedFiles(items: FileWithRelativePath[]): Promise<NotionImportResult> {
  const entries: NotionTextEntry[] = [];
  let ignoredAssetsCount = 0;

  for (const item of items) {
    const relPath = item.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relPath || isIgnoredSystemPath(relPath)) continue;

    if (/\.zip$/i.test(item.file.name)) {
      const buf = await item.file.arrayBuffer();
      const parentPrefix = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
      const zipEntries = await extractZipEntries(buf, parentPrefix);
      entries.push(...zipEntries);
      continue;
    }

    if (SUPPORTED_TEXT_RE.test(item.file.name)) {
      const content = await item.file.text();
      entries.push({ path: relPath, content });
    } else {
      ignoredAssetsCount++;
    }
  }

  return parseNotionEntries(entries, { ignoredAssetsCount });
}

export async function readNotionFromFileList(files: FileList | File[]): Promise<NotionImportResult> {
  const list = Array.from(files);
  const collected: FileWithRelativePath[] = list.map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return {
      file,
      path: rel && rel.trim() ? rel : file.name,
    };
  });
  return processCollectedFiles(collected);
}

function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readNext = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
          } else {
            all.push(...batch);
            readNext();
          }
        },
        (err) => reject(err)
      );
    };
    readNext();
  });
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function collectFromFsEntry(
  entry: FileSystemEntry,
  parentPath: string,
  out: FileWithRelativePath[]
): Promise<void> {
  const cleanName = entry.name;
  const fullPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
  if (isIgnoredSystemPath(fullPath)) return;

  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    out.push({ file, path: fullPath });
    return;
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllDirectoryEntries(dirReader);
    for (const child of children) {
      await collectFromFsEntry(child, fullPath, out);
    }
  }
}

export async function readNotionFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<NotionImportResult> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const fsEntries = items
    .map((item) => {
      const withEntry = item as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntry | null;
      };
      return typeof withEntry.webkitGetAsEntry === 'function' ? withEntry.webkitGetAsEntry() : null;
    })
    .filter((e): e is FileSystemEntry => e !== null);

  if (fsEntries.length > 0) {
    const collected: FileWithRelativePath[] = [];
    for (const entry of fsEntries) {
      await collectFromFsEntry(entry, '', collected);
    }
    return processCollectedFiles(collected);
  }

  return readNotionFromFileList(dataTransfer.files);
}
