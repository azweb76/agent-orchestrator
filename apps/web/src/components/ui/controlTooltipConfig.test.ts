import { describe, expect, it } from 'vitest';
import { CURSOR_TOOLTIP_PLACEMENT, resolveControlTooltipConfig } from './controlTooltipConfig';

describe('resolveControlTooltipConfig', () => {
  it('follows the cursor by default', () => {
    expect(resolveControlTooltipConfig({})).toEqual({
      placement: CURSOR_TOOLTIP_PLACEMENT,
      enterDelay: 300,
      disableInteractive: true,
      followCursor: true,
    });
  });

  it('uses a longer enter delay for sidebar controls', () => {
    expect(resolveControlTooltipConfig({ sidebar: true })).toMatchObject({
      enterDelay: 500,
      followCursor: true,
    });
  });

  it('anchors to the control instead of the cursor when placement is explicit', () => {
    expect(resolveControlTooltipConfig({ placement: 'left' })).toEqual({
      placement: 'left',
      enterDelay: 300,
      disableInteractive: true,
      followCursor: false,
    });
  });

  it('lets explicit props override the computed defaults', () => {
    expect(
      resolveControlTooltipConfig({ enterDelay: 50, disableInteractive: false, sidebar: true }),
    ).toMatchObject({
      enterDelay: 50,
      disableInteractive: false,
    });
  });
});
