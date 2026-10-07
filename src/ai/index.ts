import type { AIProvider } from './types';
import { localProvider } from './local';
import { claudeProvider } from './claude';
import type { Settings } from '../db/settings';

export function providerFor(settings: Pick<Settings, 'aiProvider' | 'claudeApiKey' | 'claudeModel'> | undefined): AIProvider {
  if (settings?.aiProvider === 'claude' && settings.claudeApiKey.trim()) {
    return claudeProvider(settings.claudeApiKey.trim(), settings.claudeModel || 'claude-opus-5-5');
  }
  return localProvider;
}

export type { AIProvider, AIContext, Related, Placement, Theme, ProposedSection, RefineIntent } from './types';
