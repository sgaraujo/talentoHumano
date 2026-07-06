import type { Timestamp } from 'firebase/firestore';

export type BulletinStatus = 'draft' | 'published';

interface SectionBase {
  animation?: string; // 'fade-up' | 'fade-in' | 'slide-left' | 'slide-right' | 'zoom' | ''
}

export interface TextSection extends SectionBase {
  id: string;
  type: 'text';
  title?: string;
  content: string;
  fontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
}

export interface ImageSection extends SectionBase {
  id: string;
  type: 'image';
  imageUrl: string;
  caption?: string;
}

export interface StatItem {
  value: string;
  label: string;
  color?: string;
}

export interface StatsSection extends SectionBase {
  id: string;
  type: 'stats';
  title?: string;
  stats: StatItem[];
}

export interface AccordionItem {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
}

export interface AccordionSection extends SectionBase {
  id: string;
  type: 'accordion';
  title?: string;
  items: AccordionItem[];
}

export interface CardItem {
  id: string;
  emoji?: string;
  imageUrl?: string;
  title: string;
  description: string;
  color?: string;
}

export interface CardsSection extends SectionBase {
  id: string;
  type: 'cards';
  title?: string;
  columns?: 2 | 3 | 4;
  style?: 'minimal' | 'colored' | 'image';
  items: CardItem[];
}

export interface QuoteSection extends SectionBase {
  id: string;
  type: 'quote';
  text: string;
  author?: string;
  color?: string;
}

export interface DividerSection extends SectionBase {
  id: string;
  type: 'divider';
  style?: 'line' | 'dots' | 'wave';
}

export interface VideoSection extends SectionBase {
  id: string;
  type: 'video';
  title?: string;
  url: string;
  caption?: string;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
  description?: string;
  imageUrl?: string;
}

export interface LinksSection extends SectionBase {
  id: string;
  type: 'links';
  title?: string;
  items: LinkItem[];
}

export type BulletinSection =
  | TextSection
  | ImageSection
  | StatsSection
  | AccordionSection
  | CardsSection
  | QuoteSection
  | DividerSection
  | VideoSection
  | LinksSection;

export interface BulletinViewEntry {
  id?: string;
  email: string;
  name?: string;
  source: 'email' | 'auth';
  viewedAt: string; // ISO string
}

export interface Bulletin {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  heroImageUrl?: string;
  heroColor?: string;
  introText?: string;
  sections: BulletinSection[];
  status: BulletinStatus;
  views?: number;
  tags?: string[];
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  publishedAt?: Timestamp | Date;
  createdBy: string;
  createdByName?: string;
}
