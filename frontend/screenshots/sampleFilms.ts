// Sample films for the screenshots in documentation/ui/images/. Facts and poster files are from the films' TMDB pages
// (Blender Foundation open movies, released under Creative Commons licenses); fields TMDB does not list stay empty.
import type { Film } from '../src/types'

const film = (id: number, title: string, tmdbId: number, extra: Partial<Film>): Film => ({
  id,
  title,
  releaseYear: null,
  letterboxdUrl: null,
  addedAt: '2026-10-20',
  watchedAt: null,
  tmdb: { id: tmdbId, mediaType: 'movie', status: 'matched', syncedAt: '2026-10-20T08:00:00.000Z' },
  originalTitle: null,
  tagline: null,
  overview: null,
  runtimeMinutes: null,
  voteAverage: null,
  voteCount: null,
  posterPath: null,
  backdropPath: null,
  countries: [],
  genres: [],
  directors: [],
  cast: [],
  ...extra,
})

const person = (id: number, name: string) => ({ id, name })

export const bigBuckBunny = film(1, 'Big Buck Bunny', 10378, {
  releaseYear: 2008,
  addedAt: '2026-10-24',
  overview:
    'A large, plump rabbit enjoys flowers and butterflies until three rodents, Frank, Rinky, and Gamera, harass him. He decides to drop his gentleness and take revenge by setting traps.',
  runtimeMinutes: 10,
  posterPath: '/i9jJzvoXET4D9pOkoEwncSdNNER.jpg',
  genres: [
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 10751, name: 'Family' },
  ],
  directors: [person(1, 'Sacha Goedegebure')],
})

export const sintel = film(2, 'Sintel', 45745, {
  releaseYear: 2010,
  addedAt: '2026-10-22',
  overview:
    'A young woman named Sintel, traveling through a snowy landscape, is attacked by a dragon slayer. She wounds him with her knife and he impales himself on his own spear. Exhausted, she collapses in the snow and loses consciousness.',
  runtimeMinutes: 14,
  posterPath: '/l98Zns4oQe1BSvbF4hJ8oL6VSf0.jpg',
  genres: [
    { id: 16, name: 'Animation' },
    { id: 14, name: 'Fantasy' },
  ],
  directors: [person(2, 'Colin Levy')],
  cast: [person(3, 'Halina Reijn'), person(4, 'Thom Hoffman')],
})

export const tearsOfSteel = film(3, 'Tears of Steel', 133701, {
  releaseYear: 2012,
  addedAt: '2026-10-18',
  runtimeMinutes: 12,
  posterPath: '/8qy3jRmaHR7f8VZh3iXCqCWfFsH.jpg',
  genres: [
    { id: 878, name: 'Science Fiction' },
    { id: 16, name: 'Animation' },
  ],
  directors: [person(5, 'Ian Hubert')],
})

export const elephantsDream = film(4, 'Elephants Dream', 9761, {
  releaseYear: 2006,
  addedAt: '2026-10-12',
  watchedAt: '2026-10-25T19:30:00.000Z',
  overview:
    "Emo and Proog are inside a huge, surreal machine. Emo is young, shy, and seems afraid, while Proog is older and appears to understand the machine and find safe paths. As they wander, Emo's doubts about Proog and the machine grow.",
  runtimeMinutes: 11,
  posterPath: '/9zROtU9TkpZQrOuEaMAp68FOWLK.jpg',
  genres: [
    { id: 16, name: 'Animation' },
    { id: 878, name: 'Science Fiction' },
  ],
  directors: [person(6, 'Bassam Kurdali')],
  cast: [person(7, 'Tygo Gernandt'), person(8, 'Cas Jansen')],
})

export const films = [bigBuckBunny, sintel, tearsOfSteel, elephantsDream]
