import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// TRACK

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  artistId: text('artistId').notNull(),
  title: text('title').notNull(),
  imageKey: text('imageKey').notNull(),
  audioKey: text('audioKey').notNull(),
  description: text('description'),
})

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  artist: one(artists, {
    fields: [tracks.artistId],
    references: [artists.id],
  }),
}))

// ARTIST

export const artists = sqliteTable('artists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  imageKey: text('imageKey').notNull(),
  location: text('location'),
})

export const artistsRelations = relations(artists, ({ one, many }) => ({
  tracks: many(tracks),
}))

// TS JUNK

export type TracksWithArtist = typeof tracks.$inferSelect & {
  artist: typeof artists.$inferSelect
}
