export const ZONE = 'Asia/Jerusalem';
export const DAY = 86400000;
export function israelDate(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekday(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
export function registrationOpening(startsAt, window) {
  const days = window?.NumberOfDays, minutes = window?.NumberOfMinutes;
  const known = Number.isFinite(days) && days >= 0 && Number.isFinite(minutes) && minutes >= 0;
  return { opensAt: startsAt - (known ? (days * 1440 + minutes) * 60000 : DAY), openingEstimated: !known };
}
export function normalize(a) {
  // Fizikal includes the UTC offset. Never reinterpret it in the server's zone.
  const startsAt = Date.parse(a.StartDateTimeJson);
  if (!Number.isFinite(startsAt) || !/[+-]\d\d:\d\d$|Z$/i.test(a.StartDateTimeJson || '')) throw new Error('Class timestamp has no explicit timezone');
  const date = israelDate(startsAt);
  const time = String(a.StartHour).slice(0, 2) + ':' + String(a.StartHour).slice(2, 4);
  const capacity = Number.isInteger(a.Cap) && a.Cap > 0 ? a.Cap : null;
  const registered = capacity !== null && Number.isInteger(a.OpenCount) && a.OpenCount >= 0 && a.OpenCount <= capacity ? capacity - a.OpenCount : null;
  return {
    key: `${a.LessonID}:${date}:${a.StartHour}`,
    lessonId: a.LessonID, activityId: a.ID, name: a.Name || a.Location?.Name || 'חוג',
    instructor: a.EmployeeName || '', instructorId: a.EmployeeID,
    location: a.Location?.Name || '', date, time, weekday: weekday(date), startsAt,
    ...registrationOpening(startsAt, a.TimeBeforeRegistration),
    dueAt: startsAt - DAY, duration: a.DurationInMinutes, status: a.Status,
    places: a.OpenCount, capacity, registered, paid: !!a.PaidClass, seatsMap: !!a.SeatsMap,
    clubWindow: a.TimeBeforeRegistration || null, raw: a
  };
}
export function matches(rule, a) {
  return rule.lessonId === a.lessonId && rule.weekday === a.weekday && rule.time === a.time &&
    (!rule.pinInstructor || rule.instructorId === a.instructorId);
}
