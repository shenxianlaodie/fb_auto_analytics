// Facebook Marketing API type definitions

export type AdObjective =
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_APP_PROMOTION'
  | 'OUTCOME_SALES';

export type AdStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';

export type BidStrategy =
  | 'LOWEST_COST_WITHOUT_CAP'
  | 'LOWEST_COST_WITH_BID_CAP'
  | 'COST_CAP'
  | 'TARGET_COST';

export interface FBAdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}

export interface FBCampaign {
  id: string;
  name: string;
  objective: AdObjective;
  status: AdStatus;
  special_ad_categories: string[];
  created_time: string;
  updated_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface FBAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: AdStatus;
  targeting: FBTargeting;
  bid_strategy: BidStrategy;
  daily_budget?: string;
  lifetime_budget?: string;
  billing_event: string;
  optimization_goal: string;
  start_time?: string;
  end_time?: string;
  created_time: string;
}

export interface FBTargeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: { key: string }[];
    cities?: { key: string }[];
    zips?: { key: string }[];
  };
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  custom_audiences?: { id: string }[];
  excluded_custom_audiences?: { id: string }[];
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
}

export interface FBAd {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: AdStatus;
  creative: FBCreative;
  created_time: string;
  tracking_specs?: any[];
}

export interface FBCreative {
  id: string;
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  call_to_action_type?: string;
  link_url?: string;
}

export interface FBInsightRow {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  reach: string;
  cpm: string;
  cpc: string;
  ctr: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
}

// App-specific augmented types
export interface CampaignWithMetrics extends FBCampaign {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  conversionValue: number;
  costPerConversion: number;
}

export interface AdSetWithMetrics extends FBAdSet {
  budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversion: number;
}

export interface AdWithMetrics extends FBAd {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversion: number;
}

export interface OverviewMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversion: number;
  spendChange: number;
  impressionsChange: number;
  clicksChange: number;
  conversionsChange: number;
}

export interface TrendDataPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
  conversions: number;
  conversionValue: number;
  costPerConversion: number;
}

export interface BatchJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalCount: number;
  successCount: number;
  failedCount: number;
  progress: number;
  results: BatchJobResult[];
  createdAt: string;
  updatedAt: string;
}

export interface BatchJobResult {
  row: number;
  adName: string;
  status: 'success' | 'failed';
  adId?: string;
  error?: string;
}
