// Главный компонент UI плагина
import { useState, useEffect } from 'react';
import type { PluginMessage, ScanResult } from '../shared/types';

type Status = 'idle' | 'scanning' | 'done';

// Отправляет сообщение в sandbox
function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (!msg) return;

      if (msg.type === 'scan-progress') {
        setProgress(msg.data);
      } else if (msg.type === 'scan-complete') {
        setResult(msg.data);
        setStatus('done');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleStartScan = () => {
    setStatus('scanning');
    setProgress(null);
    setResult(null);
    sendMessage({ type: 'start-scan' });
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setProgress(null);
  };

  return (
    <div style={styles.root}>
      <h2 style={styles.title}>DesignLint AI</h2>

      {status === 'idle' && (
        <>
          <p style={styles.hint}>Готов к сканированию</p>
          <button style={styles.btnPrimary} onClick={handleStartScan}>
            Сканировать файл
          </button>
        </>
      )}

      {status === 'scanning' && (
        <>
          <p style={styles.hint}>
            {progress
              ? `Сканирование... Страница ${progress.current} из ${progress.total}`
              : 'Сканирование...'}
          </p>
          <button style={{ ...styles.btnPrimary, ...styles.btnDisabled }} disabled>
            Сканировать файл
          </button>
        </>
      )}

      {status === 'done' && result !== null && (
        <>
          <ul style={styles.resultList}>
            <li>Страниц: <strong>{result.pagesScanned}</strong></li>
            <li>Нод просканировано: <strong>{result.totalNodesScanned}</strong></li>
            <li>Цветов найдено: <strong>{result.colors.length}</strong></li>
            <li>Текстов найдено: <strong>{result.texts.length}</strong></li>
            <li>Время: <strong>{result.scanDurationMs} мс</strong></li>
          </ul>
          <button style={styles.btnSecondary} onClick={handleReset}>
            Сканировать заново
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили (inline, без зависимости от CSS-файлов)
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: '20px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#1a1a1a',
  },
  title: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: 600,
  },
  hint: {
    margin: '0 0 16px',
    color: '#555',
  },
  btnPrimary: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    background: '#0D99FF',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnDisabled: {
    background: '#a0cff7',
    cursor: 'not-allowed',
  },
  btnSecondary: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    background: 'transparent',
    color: '#0D99FF',
    border: '1px solid #0D99FF',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  resultList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
} satisfies Record<string, React.CSSProperties>;
