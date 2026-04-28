import { useState, useEffect } from 'react';
import type { PluginMessage } from '../../shared/types';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Input } from './ui/Input';
import { colors, typography, spacing, borders } from '../tokens';
import { callGemini, clearCachedKey } from '../aiClient';
import { UI } from '../../shared/strings';

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
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);

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
      if (msg.type === 'ai-enabled-response') {
        setAiEnabled(msg.data.enabled);
      }
    };
    window.addEventListener('message', handler);
    sendMessage({ type: 'get-api-key' });
    parent.postMessage({ pluginMessage: { type: 'get-ai-enabled' } }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleTestKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const text = await callGemini([{ role: 'user', content: 'Ответь одним словом: работает.' }], undefined, 32);
      setTestResult(UI.settingsKeyValid(text.slice(0, 50)));
    } catch (e) {
      setTestResult(UI.settingsKeyError(String(e).slice(0, 80)));
    } finally {
      setTesting(false);
    }
  };

  const handleToggleAi = (next: boolean) => {
    setAiEnabled(next);
    parent.postMessage({
      pluginMessage: { type: 'set-ai-enabled', data: { enabled: next } },
    }, '*');
  };

  const handleSave = () => {
    if (key.trim().length === 0) return;
    clearCachedKey();
    sendMessage({ type: 'set-api-key', data: { key: key.trim() } });
    setKey('');
  };

  const handleRemove = () => {
    parent.postMessage({
      pluginMessage: { type: 'set-api-key', data: { key: '' } },
    }, '*');
    setKey('');
    setHasExisting(false);
    setSaved(true);
  };

  return (
    <div style={{ fontFamily: typography.body.fontFamily }}>
      <div
        style={{ color: colors.content, cursor: 'pointer', marginBottom: spacing.s300, fontSize: typography.body.fontSize }}
        onClick={onBack}
      >
        {UI.settingsBack}
      </div>

      <div style={{
        fontWeight: typography.h3.fontWeight,
        fontSize: typography.h3.fontSize,
        lineHeight: typography.h3.lineHeight,
        color: colors.content,
        marginBottom: spacing.s400,
      }}>
        {UI.settingsTitle}
      </div>

      <div style={styles.toggleRow}>
        <Checkbox
          checked={aiEnabled}
          onChange={(checked) => handleToggleAi(checked)}
          label={UI.aiToggleLabel}
        />
        <div style={styles.toggleHint}>{UI.aiToggleHint}</div>
      </div>

      <div style={{ marginBottom: spacing.s200, fontSize: 14, color: colors.content }}>
        Google API Key
      </div>
      <div style={{ marginBottom: spacing.s200, fontSize: 13, color: colors.contentMuted }}>
        {hasExisting ? UI.settingsKeyHintExisting : UI.settingsKeyHintNew}
      </div>
      <div style={{ marginBottom: spacing.s200, fontSize: 12, color: colors.accent }}>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
          {UI.settingsGetKey}
        </a>
      </div>
      <div style={{ marginBottom: spacing.s300 }}>
        <Input
          type="password"
          placeholder="AIza..."
          value={key}
          onChange={setKey}
        />
      </div>
      <Button onClick={handleSave} disabled={key.trim().length === 0}>
        {saved ? UI.settingsKeySaved : UI.settingsSaveKey}
      </Button>
      {hasExisting && (
        <div style={{ marginTop: spacing.s300, display: 'flex', flexDirection: 'column', gap: spacing.s200 }}>
          <Button variant="secondary" onClick={handleTestKey} disabled={testing}>
            {testing ? UI.settingsKeyTesting : UI.settingsTestKey}
          </Button>
          {testResult && (
            <div style={{
              fontSize: 13,
              color: testResult.indexOf('✓') === 0 ? '#22C55E' : '#EF4444',
            }}>
              {testResult}
            </div>
          )}
          <Button variant="secondary" onClick={handleRemove}>
            {UI.settingsRemoveKey}
          </Button>
        </div>
      )}

      <div style={styles.aboutBlock}>
        <div style={styles.aboutTitle}>{UI.aboutTitle}</div>
        <div style={styles.aboutDescription}>{UI.aboutDescription}</div>
        <div style={styles.aboutVersion}>{UI.aboutVersion}</div>
        <a
          href="https://github.com/veter2/designlint-ai/issues"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.aboutLink}
        >
          {UI.aboutFeedback}
        </a>
      </div>
    </div>
  );
}

const styles = {
  toggleRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
    marginBottom: spacing.s400,
  } as React.CSSProperties,
  toggleHint: {
    fontSize: '12px',
    color: colors.contentMuted,
    lineHeight: 1.4,
  } as React.CSSProperties,
  aboutBlock: {
    marginTop: spacing.s400 * 2,
    paddingTop: spacing.s400,
    borderTop: `${borders.stroke}px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
  } as React.CSSProperties,
  aboutTitle: {
    fontWeight: 600,
    color: colors.content,
    fontSize: typography.body.fontSize,
  } as React.CSSProperties,
  aboutDescription: {
    color: colors.contentMuted,
    fontSize: typography.body.fontSize,
    lineHeight: 1.4,
  } as React.CSSProperties,
  aboutVersion: {
    color: colors.contentMuted,
    fontSize: '12px',
  } as React.CSSProperties,
  aboutLink: {
    color: colors.accent,
    fontSize: typography.body.fontSize,
    textDecoration: 'none',
  } as React.CSSProperties,
};

export default Settings;
