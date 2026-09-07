import { describe, expect, it } from 'vitest';
import { buildScheduleStarters } from '@agent-orchestrator/shared';

describe('buildScheduleStarters', () => {
  it('offers enable chips when no schedules exist', () => {
    const starters = buildScheduleStarters({ schedules: [] });
    expect(starters.map((s) => s.id)).toEqual([
      'enable-morning',
      'enable-ci-sweep',
      'enable-review-sweep',
    ]);
    expect(starters[0]?.prompt).toContain('morning_fleet_briefing');
    expect(starters[1]?.prompt).toContain('ci_sweep');
    expect(starters[2]?.prompt).toContain('review_sweep');
  });

  it('skips enable chips for active playbooks and offers pause', () => {
    const starters = buildScheduleStarters({
      schedules: [
        {
          id: 'sch-1',
          name: 'CI sweep',
          kind: 'cron',
          playbook: 'ci_sweep',
          status: 'active',
          policy: 'auto_write_templates',
          cron: '*/30 8-18 * * 1-5',
          nextRunAt: '2026-09-07T12:00:00.000Z',
          lastRunAt: null,
        },
      ],
      max: 3,
    });
    expect(starters.some((s) => s.id === 'enable-ci-sweep')).toBe(false);
    expect(starters.some((s) => s.id === 'enable-morning')).toBe(true);
    expect(starters.some((s) => s.id === 'pause:sch-1')).toBe(true);
  });

  it('offers resume for paused schedules', () => {
    const starters = buildScheduleStarters({
      schedules: [
        {
          id: 'sch-2',
          name: 'Morning fleet briefing',
          kind: 'cron',
          playbook: 'morning_fleet_briefing',
          status: 'paused',
          policy: 'propose_in_chat',
          cron: '0 9 * * 1-5',
          nextRunAt: null,
          lastRunAt: null,
        },
      ],
      max: 4,
    });
    expect(starters.some((s) => s.id === 'resume:sch-2')).toBe(true);
    expect(starters.find((s) => s.id === 'resume:sch-2')?.prompt).toContain('paused=false');
  });
});
