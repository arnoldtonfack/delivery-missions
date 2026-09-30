import { MissionStatus } from '../../../../generated/prisma/client';
import { canTransition } from '../mission-status.machine';

describe('mission status machine', () => {
  const ALLOWED: readonly (readonly [MissionStatus, MissionStatus])[] = [
    [MissionStatus.PLANNED, MissionStatus.STARTED],
    [MissionStatus.STARTED, MissionStatus.DELIVERED],
    [MissionStatus.STARTED, MissionStatus.FAILED],
  ];
  const statuses = Object.values(MissionStatus);
  const allPairs = statuses.flatMap((from) =>
    statuses.map((to) => [from, to] as const),
  );

  it.each(allPairs)('%s → %s', (from, to) => {
    const expected = ALLOWED.some(([f, t]) => f === from && t === to);

    expect(canTransition(from, to)).toBe(expected);
  });

  it('DELIVERED and FAILED are terminal', () => {
    for (const to of statuses) {
      expect(canTransition(MissionStatus.DELIVERED, to)).toBe(false);
      expect(canTransition(MissionStatus.FAILED, to)).toBe(false);
    }
  });
});
