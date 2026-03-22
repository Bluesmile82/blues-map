export interface SpentTimePlace {
  place: string;
  coords: [number, number];
}

export interface Album {
  name: string;
  youtubeLink: string;
}

export interface Musician {
  id: string;
  name: string;
  image: string;
  image_source?: string;
  birthDate: string;
  birthPlace: string;
  birthCoords: [number, number];
  deathDate: string | null;
  deathPlace: string | null;
  deathCoords: [number, number] | null;
  spentTimePlaces: SpentTimePlace[];
  instrument: string;
  secondaryInstruments?: string[];
  bluesStyle: string;
  youtubeLink: string;
  albums: Album[];
  description: string;
  activeFrom: string;
  influences: string[];
  influencedBy: string[];
  playedWith: string[];
  secondaryStyles?: string[];
  incomplete?: boolean;
}
