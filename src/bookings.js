import { randomUUID } from 'node:crypto';

export class ValidationError extends Error {
  status = 400;
}

export class ConflictError extends Error {
  status = 409;

  constructor(message, conflict) {
    super(message);
    this.conflict = conflict;
  }
}

function requireRoom(store, roomId) {
  if (!store.rooms.some((room) => room.id === roomId)) {
    throw new ValidationError('Choose an existing room.');
  }
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new ValidationError('Use UTC timestamps, for example 2030-06-12T09:00:00Z.');
  }
  const date = new Date(value);
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== normalized) {
    throw new ValidationError('Enter a valid date and time.');
  }
  return date.toISOString();
}

const hhmm = (isoTimestamp) => isoTimestamp.slice(11, 16);

export function findConflict(bookings, roomId, startTime, endTime) {
  const candidates = bookings
    .filter((booking) => booking.roomId === roomId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return candidates.find((candidate) => candidate.startTime < endTime && startTime < candidate.endTime) ?? null;
}

export function listBookings(store, roomId, date) {
  requireRoom(store, roomId);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError('Choose a date in YYYY-MM-DD format.');
  }
  const start = parseTimestamp(`${date}T00:00:00Z`);
  const end = new Date(new Date(start).getTime() + 86_400_000).toISOString();
  return store.bookings
    .filter((booking) => booking.roomId === roomId && booking.startTime < end && booking.endTime > start)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function createBooking(store, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Provide a booking object.');
  }
  requireRoom(store, input.roomId);
  for (const field of ['title', 'organizer']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].trim().length > 100) {
      throw new ValidationError(`${field === 'title' ? 'Title' : 'Organizer'} must contain 1–100 characters.`);
    }
  }
  const startTime = parseTimestamp(input.startTime);
  const endTime = parseTimestamp(input.endTime);
  if (startTime >= endTime) {
    throw new ValidationError('End time must be after start time.');
  }
  const conflict = findConflict(store.bookings, input.roomId, startTime, endTime);
  if (conflict) {
    const room = store.rooms.find((candidate) => candidate.id === input.roomId);
    const conflictStart = startTime > conflict.startTime ? startTime : conflict.startTime;
    const conflictEnd = endTime < conflict.endTime ? endTime : conflict.endTime;
    throw new ConflictError(
      `Room ${room.name} is already booked from ${hhmm(conflict.startTime)} to ${hhmm(conflict.endTime)}, ` +
        `resulting in a conflict from ${hhmm(conflictStart)} to ${hhmm(conflictEnd)}.`,
      { roomName: room.name, start: conflict.startTime, end: conflict.endTime, conflictStart, conflictEnd }
    );
  }
  const booking = {
    id: randomUUID(),
    roomId: input.roomId,
    title: input.title.trim(),
    organizer: input.organizer.trim(),
    startTime,
    endTime,
  };
  store.bookings.push(booking);
  return booking;
}
