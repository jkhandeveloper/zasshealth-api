import { buildSlots, dateBounds } from './slots';
describe('UTC slot boundaries', () => {
  it('includes only complete slots within opening hours', () => {
    expect(
      buildSlots('2030-01-01', '09:00', '10:10', 30).map((d) =>
        d.toISOString(),
      ),
    ).toEqual(['2030-01-01T09:00:00.000Z', '2030-01-01T09:30:00.000Z']);
  });
  it('rejects impossible calendar dates', () => {
    expect(() => dateBounds('2030-02-30')).toThrow();
  });
  it('accepts leap days', () => {
    expect(dateBounds('2032-02-29').end.toISOString()).toBe(
      '2032-03-01T00:00:00.000Z',
    );
  });
  it('does not emit a slot when the window is too short', () => {
    expect(buildSlots('2030-01-01', '09:00', '09:15', 30)).toEqual([]);
  });
  it('rejects a zero duration', () => {
    expect(() => buildSlots('2030-01-01', '09:00', '10:00', 0)).toThrow();
  });
});
