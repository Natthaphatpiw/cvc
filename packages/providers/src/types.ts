import type { CandidateRef, ClientSource, CreatorProfile, CreatorVideo } from '@cvc/schemas';

export type SourceDoc = {
  sourceType: ClientSource;
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
  /** Mock/sample docs carry `mock: true` so downstream results can be flagged `isDemo`. */
  meta: Record<string, unknown>;
};

export interface KolDataProvider {
  name: string;
  mock: boolean;
  /** Thailand only (best effort for live providers; see searchCreators in scrapecreators.ts). */
  searchCreators(q: { keyword: string; limit: number }): Promise<CandidateRef[]>;
  getProfile(handle: string): Promise<CreatorProfile | null>;
  getVideos(handle: string, limit: number): Promise<CreatorVideo[]>;
}

export interface ClientIntelProvider {
  name: string;
  mock: boolean;
  crawlWebsite(url: string, maxPages: number): Promise<SourceDoc[]>;
  facebookPage(url: string, maxPosts: number, timeoutSec: number): Promise<SourceDoc[]>;
  tiktokProfile(url: string): Promise<SourceDoc[]>;
}

export type ClientIntelSource = 'website' | 'facebook' | 'tiktok';
