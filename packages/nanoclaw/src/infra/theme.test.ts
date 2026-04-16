import { describe, it, expect } from 'vitest';
import { getTheme, type NanoClawTheme, resolveTheme } from './theme.js';

describe('theme', () => {
  describe('resolveTheme', () => {
    it('returns dark theme when COLORFGBG indicates dark background', () => {
      process.env.COLORFGBG = '15;0';
      const name = resolveTheme();
      expect(name).toBe('dark');
    });

    it('returns light theme when COLORFGBG indicates light background', () => {
      process.env.COLORFGBG = '0;15';
      const name = resolveTheme();
      expect(name).toBe('light');
    });

    it('defaults to dark when COLORFGBG is not set', () => {
      delete process.env.COLORFGBG;
      const name = resolveTheme();
      expect(name).toBe('dark');
    });
  });

  describe('getTheme', () => {
    it('returns dark theme with correct brand color', () => {
      const theme = getTheme('dark');
      expect(theme.brand).toBe('rgb(215,119,87)');
      expect(theme.text).toBe('rgb(255,255,255)');
      expect(theme.subtle).toBe('rgb(80,80,80)');
    });

    it('returns light theme with correct brand color', () => {
      const theme = getTheme('light');
      expect(theme.brand).toBe('rgb(215,119,87)');
      expect(theme.text).toBe('rgb(0,0,0)');
      expect(theme.subtle).toBe('rgb(175,175,175)');
    });

    it('both themes have all required keys', () => {
      const dark = getTheme('dark');
      const light = getTheme('light');
      const keys: Array<keyof NanoClawTheme> = [
        'brand',
        'brandShimmer',
        'user',
        'assistant',
        'success',
        'error',
        'warning',
        'text',
        'inactive',
        'subtle',
        'suggestion',
        'border',
        'agentRed',
        'agentBlue',
        'agentGreen',
        'agentYellow',
        'agentPurple',
        'agentOrange',
        'agentPink',
        'agentCyan',
      ];
      for (const key of keys) {
        expect(dark[key]).toBeDefined();
        expect(light[key]).toBeDefined();
      }
    });
  });
});
