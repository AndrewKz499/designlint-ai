// Persisted single-select selectedSource (Ф.16.6.5).
// Хранится одиночный объект SelectedSource в clientStorage под одним ключом.
// Не путать с прежней multi-select моделью (массив enabled-флагов).

import type { SelectedSource } from '../shared/types';

const STORAGE_KEY = 'designlint-selected-source';

/**
 * Читает persisted selectedSource из clientStorage.
 * Если ключ отсутствует или данные битые — возвращает default { type: 'local' }.
 *
 * Default { type: 'library', libraryKey: <первая> } определяется на уровне
 * code.ts после discoverSources(): этот хелпер не должен сам дёргать
 * teamLibrary API, чтобы оставаться синхронным по поведению.
 */
export async function getSelectedSource(): Promise<SelectedSource> {
  try {
    const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
    if (raw === undefined || raw === null) {
      return { type: 'local' };
    }
    // Минимальная валидация формы: ожидаем объект с дискриминатором type.
    if (typeof raw !== 'object') return { type: 'local' };
    const obj = raw as { type?: string; libraryKey?: string };
    if (obj.type === 'local') return { type: 'local' };
    if (obj.type === 'library' && typeof obj.libraryKey === 'string' && obj.libraryKey !== '') {
      return { type: 'library', libraryKey: obj.libraryKey };
    }
    return { type: 'local' };
  } catch {
    return { type: 'local' };
  }
}

/**
 * Сохраняет selectedSource в clientStorage под фиксированным ключом.
 * При ошибке — выбрасывает наверх; обработчик code.ts включает её
 * в ответ set-selected-source-done с success=false.
 */
export async function setSelectedSource(source: SelectedSource): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY, source);
}
