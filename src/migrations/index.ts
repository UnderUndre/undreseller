import * as migration_20261107_003147_booking_gist from './20261107_003147_booking_gist';
import * as migration_20261112_000001_order_enum_values from './20261112_000001_order_enum_values';
import * as migration_20261112_000002_complete_domain_schema from './20261112_000002_complete_domain_schema';
import * as migration_20261113_000001_deposit_payment_mode from './20261113_000001_deposit_payment_mode';

export const migrations = [
  {
    up: migration_20261107_003147_booking_gist.up,
    down: migration_20261107_003147_booking_gist.down,
    name: '20261107_003147_booking_gist',
  },
  {
    up: migration_20261112_000001_order_enum_values.up,
    down: migration_20261112_000001_order_enum_values.down,
    name: '20261112_000001_order_enum_values',
  },
  {
    up: migration_20261112_000002_complete_domain_schema.up,
    down: migration_20261112_000002_complete_domain_schema.down,
    name: '20261112_000002_complete_domain_schema',
  },
  {
    up: migration_20261113_000001_deposit_payment_mode.up,
    down: migration_20261113_000001_deposit_payment_mode.down,
    name: '20261113_000001_deposit_payment_mode',
  },
];
