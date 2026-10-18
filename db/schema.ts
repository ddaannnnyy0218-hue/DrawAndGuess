import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('game_rooms', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});
export const events = sqliteTable('draw_events', {
  id: integer('id').primaryKey({autoIncrement:true}),
  code: text('code').notNull(),
  roundId: text('round_id').notNull(),
  clientKey: text('client_key').notNull(),
  payload: text('payload').notNull(),
}, (table) => [index('draw_events_room_round').on(table.code, table.roundId, table.id), uniqueIndex('draw_events_dedupe').on(table.code,table.roundId,table.clientKey)]);
