import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import { desc, eq } from 'drizzle-orm'
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { jsxRenderer } from 'hono/jsx-renderer'
import * as schema from './schema'

type Bindings = {
  BUCKET: R2Bucket
  DB: D1Database
  DRIZZ: DrizzleD1Database<typeof schema>
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', (c, next) => {
  c.env.DRIZZ = drizzle(c.env.DB, { schema })
  return next()
})

app.get('/static/*', serveStatic({ root: './' }))

app.get(
  '*',
  jsxRenderer(({ children }) => {
    return (
      <html lang="en" data-theme="dark">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="stylesheet" href="/static/pico.css" />
          <link rel="stylesheet" href="/static/pico_ext.css" />
          <title>tunez</title>
        </head>
        <body>
          <article style="margin-top: 0; padding: 20px; display: flex; gap: 20px;">
            <a href="/">tunez</a>
            <a href="/artists">artists</a>
            <a href="/tracks/new">upload</a>
            <a href="/about">about</a>
          </article>

          <div style="padding-bottom: 200px">{children}</div>
        </body>
        <script src="/static/player.js"></script>
      </html>
    )
  })
)

app.get('/about', (c) => {
  return c.render(
    <div class="container">
      <h1>trackz</h1>
      <p>Upload tracks, listen to tracks... that's about it</p>
      <p>
        <b>TODO</b>
        <br />
        <ul>
          <li>img resize in prod</li>
          <li>explicit img / song url (for cache busting)</li>
          <li>some client side routing</li>
          <li>more fancy client side player...</li>
          <li>playlists</li>
          <li>album releases</li>
          <li>rss feed</li>
          <li>can edit artist / track</li>
          <li>maybe some drizzle?</li>
        </ul>
      </p>
    </div>
  )
})

//
// TRACKS
//

app.get('/', async (c) => {
  const tracks = await c.env.DRIZZ.query.tracks.findMany({
    with: {
      artist: true,
    },
    orderBy: [desc(schema.tracks.id)],
  })

  return c.render(
    <div>
      <div class="tile-grid">
        {tracks.map((t) => (
          <TrackUI track={t} />
        ))}
      </div>
      <div style="position: fixed; bottom: 0px; width: 100%; padding: 20px;">
        <audio style="width: 100%" id="player" controls />
      </div>
    </div>
  )
})

const TrackUI = ({ track }: { track: schema.TracksWithArtist }) => (
  <article id={track.id} class="track" onClick={`play('${track.id}')`} style="padding: 20px; margin: 0px;">
    <img class="sq" src={`/upload/img${track.id}`} />
    <hgroup>
      <h3>{track.title}</h3>
      <p>{track.artist.name}</p>
    </hgroup>
    {/* <div>{track.description}</div>
    <div>{new Date(track.created_at).toLocaleDateString()}</div> */}

    <div class="onHover">
      <a href={`/tracks/${track.id}`}>View</a>
      <a href={`/tracks/${track.id}/edit`}>Edit</a>
    </div>
  </article>
)

const TrackForm = ({ track, artists }: { track?: typeof schema.tracks.$inferInsert; artists: (typeof schema.artists.$inferSelect)[] }) => (
  <form class="container" method="POST" enctype="multipart/form-data">
    <input type="hidden" name="id" value={track?.id} />
    <article>
      <header>
        <label>Artist</label>
        <fieldset style="display: flex;">
          <select name="artist_id" required style="margin-bottom: 0px;">
            <option value="" selected={!track?.artistId}>
              - Select Artist -
            </option>
            {artists.map((a) => (
              <option value={a.id} selected={track?.artistId === a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <a class="secondary nowrap outline" role="button" href="/artists/new">
            + New Artist
          </a>
        </fieldset>
      </header>

      <label>
        Title
        <input type="text" name="title" placeholder="title" value={track?.title} required />
      </label>

      <label>
        Description <br />
        <small class="secondary">Describe process, instruments, tools, techniques</small>
        <textarea name="description"></textarea>
      </label>

      <div class="grid">
        <label>
          Audio
          <input type="file" name="song" accept="audio/*" required={!track} />
        </label>
        <label>
          Image
          <input type="file" name="image" accept="image/*" required={!track} />
        </label>
      </div>

      <footer>
        <button> submit </button>
      </footer>
    </article>
  </form>
)

app.get('/tracks/new', async (c) => {
  const artists = await c.env.DRIZZ.query.artists.findMany({ orderBy: schema.artists.name })
  return c.render(<TrackForm artists={artists} />)
})

app.post('/tracks/new', async (c, next) => {
  const id = `_${Date.now()}`
  const body = await c.req.parseBody()
  const song = body['song'] as File
  const image = body['image'] as File

  // todo: some zod validator
  const trackData = body as Record<string, string>

  await Promise.all([
    c.env.BUCKET.put(`song${id}`, song),
    c.env.BUCKET.put(`img${id}`, image),
    c.env.DRIZZ.insert(schema.tracks).values({
      id: id,
      title: trackData.title,
      artistId: trackData.artist_id,
      description: trackData.description,
    }),
  ])

  return c.redirect('/')
})

app.get('/tracks/:id', async (c) => {
  const id = c.req.param('id')
  const track = await c.env.DRIZZ.query.tracks.findFirst({
    where: eq(schema.tracks.id, id),
    with: {
      artist: true,
    },
  })
  if (!track) return c.text('not found', 404)
  // return c.json(track)
  return c.render(<TrackUI track={track} />)
})

app.get('/tracks/:id/edit', async (c) => {
  const id = c.req.param('id')
  const track = await c.env.DRIZZ.query.tracks.findFirst({ where: eq(schema.tracks.id, id) })
  if (!track) return c.text('not found', 404)
  const artists = await c.env.DRIZZ.query.artists.findMany({ orderBy: schema.artists.name })
  return c.render(<TrackForm track={track} artists={artists} />)
})

app.post('/tracks/:id/edit', async (c) => {
  const body = await c.req.parseBody()

  const work = []
  if (body.image) {
    work.push(c.env.BUCKET.put(`img${body.id}`, body.image as File))
  }

  if (body.song) {
    work.push(c.env.BUCKET.put(`song${body.id}`, body.song as File))
  }

  // todo: zod stuff
  const data = body as Record<string, string>
  work.push(
    c.env.DRIZZ.update(schema.tracks)
      .set({
        title: data.title,
      })
      .where(eq(schema.tracks.id, data.id))
  )

  await Promise.all(work)

  return c.redirect(`/tracks/${body.id}`)
})

app.get('/upload/:key', async (c, next) => {
  const key = c.req.param('key')
  const object = await c.env.BUCKET.get(key)
  if (!object) return c.notFound()
  const data = await object.arrayBuffer()
  const contentType = object.httpMetadata?.contentType ?? ''
  const maxAge = 60 * 60 * 24 * 30

  return c.body(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'Content-Type': contentType,
  })
})

//
// Artist
//

app.get('/artists/new', async (c) => {
  const artist: any = {}
  return c.render(<ArtistForm />)
})

app.post('/artists/new', async (c) => {
  const id = `A${Date.now()}`
  const body = await c.req.parseBody()

  const image = body.image as File
  delete body.image

  await Promise.all([
    c.env.BUCKET.put(`img${id}`, image),
    c.env.DRIZZ.insert(schema.artists).values({
      id,
      ...(body as any), // todo: zod
    }),
  ])

  // hacky wizard stuff...
  return c.redirect('/tracks/new')
})

app.get('/artists', async (c) => {
  const { results } = await c.env.DB.prepare('select * from artists').all()
  if (c.req.query('json')) return c.json(results)
  return c.render(
    <div class="container-fluid">
      <h1>Artists</h1>
      <div class="tile-grid">
        {results.map((a) => (
          <article>
            <a href={`/artists/${a.id}`}>
              <img class="sq" src={`/upload/img${a.id}`} />
              <hgroup>
                <h2>{a.name}</h2>
                <p>{a.location}</p>
              </hgroup>
            </a>
          </article>
        ))}
      </div>
    </div>
  )
})

app.get('/artists/:id', async (c) => {
  const artist = await c.env.DRIZZ.query.artists.findFirst({
    where: eq(schema.artists.id, c.req.param('id')),
    with: {
      tracks: true,
    },
  })
  if (!artist) return c.text('not found', 404)
  if (c.req.query('json')) return c.json(artist)
  return c.render(
    <div class="container-fluid">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style="flex-grow: 1; margin-bottom: 0">{artist.name}</h1>
        <a href={`/artists/${artist.id}/edit`}>edit</a>
      </div>

      {artist.tracks.map((t) => (
        <TrackUI track={{ ...t, artist }} />
      ))}
    </div>
  )
})

app.get('/artists/:id/edit', async (c) => {
  const artist = await c.env.DRIZZ.query.artists.findFirst({
    where: eq(schema.artists.id, c.req.param('id')),
  })
  if (!artist) return c.text('not found', 404)
  return c.render(<ArtistForm artist={artist} />)
})

app.post('/artists/:id/edit', async (c) => {
  const body = await c.req.parseBody()

  const image = body.image as File
  if (image) {
    await c.env.BUCKET.put(`img${body.id}`, image)
  }

  // todo: zod stuff
  const data = body as Record<string, string>

  await c.env.DRIZZ.update(schema.artists)
    .set({
      name: data.name,
    })
    .where(eq(schema.artists.id, body.id as string))

  return c.redirect(`/artists/${body.id}`)
})

function ArtistForm({ artist }: { artist?: typeof schema.artists.$inferInsert }) {
  return (
    <form class="container" method="POST" enctype="multipart/form-data">
      <input type="hidden" name="id" value={artist?.id} />
      <label>
        Name
        <input type="text" name="name" placeholder="Artist Name" value={artist?.name} required />
      </label>
      <label>
        Website
        <input type="url" name="website" />
      </label>
      <label>
        Location
        <input type="text" name="location" />
      </label>
      <label>
        Bio
        <textarea name="bio"></textarea>
      </label>
      <label>
        Image
        <input type="file" name="image" accept="image/*" required={!artist} />
      </label>
      <button>Submit</button>
    </form>
  )
}

//
// API
//

app.get('/api/tracks', async (c) => {
  const db = c.env.DRIZZ
  const ok = await db.query.tracks.findMany({
    with: {
      artist: true,
    },
  })
  return c.json(ok)
})

app.get('/api/artists', async (c) => {
  const ok = await c.env.DRIZZ.query.artists.findMany({
    with: {
      tracks: true,
    },
  })
  return c.json(ok)
})

export default app
