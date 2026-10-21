// "Good for you": games that fit Darren's free hours in SGT, are played overseas, are on a streamer,
// or are playoffs. A helper only: nothing is followed without his tap (PRD 7.8). Rules live in rules.js.
import { settings } from './store.js';
import { freeHourWith, reasonsWith } from './rules.js';

export const freeHour = (g) => freeHourWith(g, settings);
export const reasons = (g) => reasonsWith(g, settings);
export const FREE_WINDOWS = [
  { key: 'mornings', label: 'Weekday mornings', sub: 'Mon to Fri, 07:00 to 10:30' },
  { key: 'evenings', label: 'Evenings', sub: 'Every day, 19:00 to 01:00' },
  { key: 'late', label: 'Weekend late nights', sub: 'Fri and Sat nights, to 03:00' },
];
