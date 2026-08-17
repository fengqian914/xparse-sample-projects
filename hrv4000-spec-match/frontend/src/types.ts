export type MatchStatus = 'pending' | 'matched' | 'partial' | 'unmatched';

export interface RequirementItem {
  id: number;
  seq: string;
  reqType: string;
  category: string;
  nature: string;
  item: string;
  explain: string;
  example: string;
  srcChapter: string;
  srcDesc: string;
  zhChapter: string;
  zhDesc: string;
  page: number | null;
  matchStatus: MatchStatus;
}

export interface ExtractResult {
  id: number;
  matchStatus: MatchStatus;
  srcChapter: string;
  srcDesc: string;
  zhChapter: string;
  zhDesc: string;
  page: number | null;
}
