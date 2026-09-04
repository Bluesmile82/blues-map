import type { Musician } from '../types'

export const mockMusician: Musician = {
  id: 'robert-johnson',
  name: 'Robert Johnson',
  image: '/images/musicians/robert-johnson.png',
  image_source: 'Public domain',
  birthDate: '1911-05-08',
  birthPlace: 'Hazlehurst, MS',
  birthCoords: [-90.3904, 31.8668],
  deathDate: '1938-08-16',
  deathPlace: 'Greenwood, MS',
  deathCoords: [-90.1795, 33.5165],
  spentTimePlaces: [
    { place: 'Clarksdale, MS', coords: [-90.5707, 34.2004] },
    { place: 'Memphis, TN', coords: [-90.0490, 35.1495] },
  ],
  instrument: 'Guitar, Vocals',
  bluesStyle: 'Delta Blues',
  youtubeLink: 'https://www.youtube.com/watch?v=WMT4lFbhCpE',
  albums: [
    { name: 'King of the Delta Blues Singers', youtubeLink: 'https://www.youtube.com/watch?v=WMT4lFbhCpE' },
    { name: 'King of the Delta Blues Singers Vol. II', youtubeLink: '' },
  ],
  description: 'Robert Johnson is one of the most influential blues musicians of all time. His recordings, made in 1936 and 1937, display a remarkable command of the guitar and a haunting, emotionally rich vocal style.',
  activeFrom: '1930',
  influences: [],
  influencedBy: [],
  playedWith: [],
  secondaryStyles: ['Country Blues'],
  createdAt: '2026-09-03',
}

export const mockMusicianWithConnections: Musician = {
  ...mockMusician,
  id: 'muddy-waters',
  name: 'Muddy Waters',
  bluesStyle: 'Chicago Blues',
  secondaryStyles: ['Delta Blues', 'Electric Blues'],
  birthDate: '1913-04-04',
  birthPlace: 'Jug\'s Corner, MS',
  deathDate: '1983-04-30',
  deathPlace: 'Westmont, IL',
  deathCoords: [-87.9736, 41.7964],
  influences: ['robert-johnson'],
  description: 'McKinley Morganfield, known professionally as Muddy Waters, was an American blues singer-songwriter and musician who is often cited as the "father of modern Chicago blues".',
  albums: [
    { name: 'Folk Singer', youtubeLink: '' },
    { name: 'Hard Again', youtubeLink: '' },
    { name: 'At Newport 1960', youtubeLink: '' },
  ],
}

export const mockUser = {
  id: 'user-123',
  email: 'blues.fan@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
} as any
