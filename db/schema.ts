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
export const challenges=sqliteTable('drawing_challenges',{
 id:text('id').primaryKey(),levelId:integer('level_id').notNull(),creator:text('creator').notNull(),
 drawing:text('drawing').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const attempts=sqliteTable('challenge_attempts',{
 id:text('id').primaryKey(),challengeId:text('challenge_id').notNull(),token:text('token').notNull(),
 name:text('name').notNull(),state:text('state').notNull(),version:integer('version').notNull().default(0),
 score:integer('score').notNull().default(0),solved:integer('solved').notNull().default(0),startedAt:integer('started_at').notNull(),
},table=>[index('challenge_attempts_board').on(table.challengeId,table.solved,table.score)]);
export const rankedProfiles=sqliteTable('ranked_profiles',{
 id:text('id').primaryKey(),token:text('token').notNull(),name:text('name').notNull(),avatar:integer('avatar').notNull(),
 rp:integer('rp').notNull().default(0),wins:integer('wins').notNull().default(0),losses:integer('losses').notNull().default(0),createdAt:integer('created_at').notNull(),
});
export const rankedQueue=sqliteTable('ranked_queue',{
 profileId:text('profile_id').primaryKey(),rating:integer('rating').notNull(),queuedAt:integer('queued_at').notNull(),seenAt:integer('seen_at').notNull(),matchId:text('match_id'),
},table=>[index('ranked_queue_pool').on(table.matchId,table.rating,table.seenAt)]);
export const rankedMatches=sqliteTable('ranked_matches',{
 id:text('id').primaryKey(),state:text('state').notNull(),version:integer('version').notNull().default(0),updatedAt:integer('updated_at').notNull(),
});
export const rankedResults=sqliteTable('ranked_results',{
 matchId:text('match_id').notNull(),profileId:text('profile_id').notNull(),delta:integer('delta').notNull(),won:integer('won').notNull(),lost:integer('lost').notNull(),applied:integer('applied').notNull().default(0),
},table=>[uniqueIndex('ranked_result_once').on(table.matchId,table.profileId)]);
export const rankedMemory=sqliteTable('ranked_memory',{
 profileId:text('profile_id').primaryKey(),words:text('words').notNull().default('[]'),sources:text('sources').notNull().default('[]'),
});
