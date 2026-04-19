export type NanoClawTheme = {
  brand: string;
  brandShimmer: string;
  user: string;
  assistant: string;
  success: string;
  error: string;
  warning: string;
  text: string;
  inactive: string;
  subtle: string;
  suggestion: string;
  border: string;
  agentRed: string;
  agentBlue: string;
  agentGreen: string;
  agentYellow: string;
  agentPurple: string;
  agentOrange: string;
  agentPink: string;
  agentCyan: string;
};

export type ThemeName = 'dark' | 'light';

const darkTheme: NanoClawTheme = {
  brand: 'rgb(215,119,87)',
  brandShimmer: 'rgb(235,159,127)',
  user: 'rgb(255,255,255)',
  assistant: 'rgb(215,119,87)',
  success: 'rgb(78,186,101)',
  error: 'rgb(255,107,128)',
  warning: 'rgb(255,193,7)',
  text: 'rgb(255,255,255)',
  inactive: 'rgb(153,153,153)',
  subtle: 'rgb(80,80,80)',
  suggestion: 'rgb(177,185,249)',
  border: 'rgb(80,80,80)',
  agentRed: 'rgb(220,38,38)',
  agentBlue: 'rgb(37,99,235)',
  agentGreen: 'rgb(22,163,74)',
  agentYellow: 'rgb(202,138,4)',
  agentPurple: 'rgb(147,51,234)',
  agentOrange: 'rgb(234,88,12)',
  agentPink: 'rgb(219,39,119)',
  agentCyan: 'rgb(8,145,178)',
};

const lightTheme: NanoClawTheme = {
  brand: 'rgb(215,119,87)',
  brandShimmer: 'rgb(245,149,117)',
  user: 'rgb(0,0,0)',
  assistant: 'rgb(215,119,87)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  text: 'rgb(0,0,0)',
  inactive: 'rgb(102,102,102)',
  subtle: 'rgb(175,175,175)',
  suggestion: 'rgb(87,105,247)',
  border: 'rgb(175,175,175)',
  agentRed: 'rgb(220,38,38)',
  agentBlue: 'rgb(37,99,235)',
  agentGreen: 'rgb(22,163,74)',
  agentYellow: 'rgb(202,138,4)',
  agentPurple: 'rgb(147,51,234)',
  agentOrange: 'rgb(234,88,12)',
  agentPink: 'rgb(219,39,119)',
  agentCyan: 'rgb(8,145,178)',
};

export function resolveTheme(): ThemeName {
  const colorfgbg = process.env.COLORFGBG;
  if (!colorfgbg) return 'dark';
  const parts = colorfgbg.split(';');
  if (parts.length < 2) return 'dark';
  const bg = Number.parseInt(parts[1] ?? '', 10);
  if (Number.isNaN(bg)) return 'dark';
  return bg >= 8 ? 'light' : 'dark';
}

export function getTheme(name: ThemeName): NanoClawTheme {
  return name === 'light' ? lightTheme : darkTheme;
}
