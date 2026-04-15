import { useState, useEffect } from 'react';
import type { PluginMessage } from '../../shared/types';
import { Button } from './ui/Button';
import { colors, typography, spacing, radii } from '../tokens';

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

  const handleSave = () => {
    if (key.trim().length === 0) return;
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
        Anthropic API Key
      </div>
      <div style={{ marginBottom: spacing.s200, fontSize: 13, color: colors.textMuted }}>
        {hasExisting ? 'Ключ сохранён. Введите новый для замены.' : 'Введите ключ для AI-функций (Исправить все).'}
      </div>
      <input
        type="password"
        placeholder="sk-ant-..."
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
    </div>
  );
}

export default Settings;
