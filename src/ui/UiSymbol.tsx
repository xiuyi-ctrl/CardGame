export const UI_SYMBOL_NAMES = ['lock', 'none', 'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down',
  'close', 'pause', 'play', 'plus', 'sparkle', 'step-active', 'step-inactive', 'marker-info', 'warning', 'error'] as const;

export const UI_SYMBOL_IMAGES = UI_SYMBOL_NAMES.map(name => `/ui-symbol-icons/${name}.png`);

export function UiSymbol({ name }: { name: typeof UI_SYMBOL_NAMES[number] }) {
  return <img className="ui-symbol" src={`/ui-symbol-icons/${name}.png`} alt="" aria-hidden="true" draggable={false} />;
}
