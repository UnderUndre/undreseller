import * as migration_20261107_003147_booking_gist from './20261107_003147_booking_gist';

export const migrations = [
  {
    up: migration_20261107_003147_booking_gist.up,
    down: migration_20261107_003147_booking_gist.down,
    name: '20261107_003147_booking_gist'
  },
];
