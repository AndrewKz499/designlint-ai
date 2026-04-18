import { useState, useEffect } from 'react';
import type { PluginMessage } from '../../shared/types';
import { Button } from './ui/Button';
import { colors, typography, spacing, radii } from '../tokens';
import { callGemini, clearCachedKey } from '../aiClient';

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  onBack: () => void;
}

export function Settings({ onBack }: Props) {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // При монтировании проверяем, есть ли уже ключ
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (!msg) return;
      if (msg.type === 'api-key-response') {
        setHasExisting(msg.data.key !== null && msg.data.key !== '');
      }
      if (msg.type === 'set-api-key-done') {
        setSaved(true);
        setHasExisting(true);
        setTimeout(() => setSaved(false), 2000);
      }
    };
    window.addEventListener('message', handler);
    sendMessage({ type: 'get-api-key' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleTestKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const text = await callGemini([{ role: 'user', content: 'Ответь одним словом: работает.' }], undefined, 32);
      setTestResult('✓ Ключ работает: ' + text.slice(0, 50));
    } catch (e) {
      setTestResult('✗ Ошибка: ' + String(e).slice(0, 80));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (key.trim().length === 0) return;
    clearCachedKey();
    sendMessage({ type: 'set-api-key', data: { key: key.trim() } });
    setKey('');
  };

  return (
    <div style={{ padding: spacing.s400, fontFamily: typography.body.fontFamily }}>
      <div
        style={{ color: colors.accentBlue, cursor: 'pointer', marginBottom: spacing.s300, fontSize: typography.body.fontSize }}
        onClick={onBack}
      >
        ← Назад
      </div>

      <div style={{
        fontWeight: typography.heading.fontWeight,
        fontSize: typography.heading.fontSize,
        lineHeight: typography.heading.lineHeight,
        color: colors.textDefault,
        marginBottom: spacing.s400,
      }}>
        Настройки
      </div>

      <div style={{ marginBottom: spacing.s200, fontSize: 14, color: colors.textBody }}>
        Google API Key
      </div>
      <div style={{ marginBottom: spacing.s200, fontSize: 13, color: colors.textMuted }}>
        {hasExisting ? 'Ключ сохранён. Введите новый для замены.' : 'Введите ключ для AI-функций (Исправить все).'}
      </div>
      <div style={{ marginBottom: spacing.s200, fontSize: 12, color: colors.accentBlue }}>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: colors.accentBlue }}>
          Получить ключ на aistudio.google.com
        </a>
      </div>
      <input
        type="password"
        placeholder="AIza..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
        style={{
          width: '100%',
          padding: spacing.s300,
          fontSize: typography.body.fontSize,
          fontFamily: typography.body.fontFamily,
          border: '1px solid ' + colors.borderDefault,
          borderRadius: radii.r200,
          marginBottom: spacing.s300,
          boxSizing: 'border-box',
        }}
      />
      <Button onClick={handleSave} disabled={key.trim().length === 0}>
        {saved ? 'Сохранено ✓' : 'Сохранить ключ'}
      </Button>
      {hasExisting && (
        <div style={{ marginTop: spacing.s300 }}>
          <Button variant="secondary" onClick={handleTestKey} disabled={testing}>
            {testing ? 'Проверяю...' : 'Проверить ключ'}
          </Button>
          {testResult && (
            <div style={{
              marginTop: spacing.s200,
              fontSize: 13,
              color: testResult.indexOf('✓') === 0 ? '#22C55E' : '#EF4444',
            }}>
              {testResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Settings;
