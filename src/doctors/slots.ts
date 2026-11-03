import { BadRequestException } from '@nestjs/common';
export function dateBounds(date: string) {
  const start = new Date(date + 'T00:00:00.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 10) !== date
  )
    throw new BadRequestException('Invalid calendar date');
  return { start, end: new Date(start.getTime() + 86400000) };
}
export function buildSlots(
  date: string,
  startTime: string,
  endTime: string,
  duration: number,
): Date[] {
  const { start } = dateBounds(date);
  const minute = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const slots: Date[] = [];
  if (!Number.isInteger(duration) || duration <= 0)
    throw new BadRequestException('Invalid slot duration');
  for (
    let m = minute(startTime);
    m + duration <= minute(endTime);
    m += duration
  )
    slots.push(new Date(start.getTime() + m * 60000));
  return slots;
}
