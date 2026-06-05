import Papa from 'papaparse';
import { FacebookClient } from './facebookClient';
import { createBatchJob, updateBatchProgress, getBatchJob, BatchResult } from '../models/batchJob';

interface CsvRow {
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  targeting_age_min: string;
  targeting_age_max: string;
  targeting_gender: string;
  targeting_interests: string;
  budget_daily: string;
  headline: string;
  body_text: string;
  cta: string;
  link: string;
  image_url: string;
}

export class BatchService {
  private fbClient: FacebookClient;
  private accessToken: string;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.fbClient = FacebookClient.getInstance();
    this.accessToken = accessToken;
    this.userId = userId;
  }

  async processBatch(accountId: string, csvContent: string): Promise<{ jobId: string; message: string }> {
    const cleanId = accountId.replace('act_', '');

    // Parse CSV
    const parseResult = Papa.parse<CsvRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transform: (value) => value.trim(),
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV 解析失败: ${parseResult.errors[0].message}`);
    }

    const rows = parseResult.data.filter(row => row.campaign_name && row.ad_name);

    if (rows.length === 0) {
      throw new Error('CSV 文件中没有有效数据');
    }

    if (rows.length > 100) {
      throw new Error('单次批量发布最多支持 100 条广告');
    }

    // Create batch job
    const job = await createBatchJob(this.userId, cleanId, rows.length);

    // Start async processing (don't await — let it run in background)
    this.executeBatch(job.id, cleanId, rows).catch(err => {
      console.error(`[BatchService] Job ${job.id} failed:`, err);
      updateBatchProgress(job.id, { status: 'failed' });
    });

    return {
      jobId: job.id,
      message: `批量任务已创建，共 ${rows.length} 条广告，请等待处理完成`,
    };
  }

  async getJobStatus(jobId: string) {
    const job = await getBatchJob(jobId);
    if (!job) throw new Error('批量任务不存在');

    return {
      id: job.id,
      status: job.status,
      totalCount: job.total_count,
      successCount: job.success_count,
      failedCount: job.failed_count,
      progress: job.progress,
      results: JSON.parse(job.results || '[]'),
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    };
  }

  private async executeBatch(jobId: string, accountId: string, rows: CsvRow[]) {
    updateBatchProgress(jobId, { status: 'processing' });

    const results: BatchResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Process sequentially to respect rate limits
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // 1. Create campaign
        const campaign = await this.fbClient.createCampaign(accountId, this.accessToken, {
          name: row.campaign_name,
          objective: 'CONVERSIONS',
          status: 'PAUSED',
          special_ad_categories: [],
        });

        // 2. Create ad set with targeting
        const targeting = this.parseTargeting(row);
        const adset = await this.fbClient.createAdSet(accountId, this.accessToken, {
          name: row.adset_name,
          campaign_id: campaign.id,
          targeting,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'REACH',
          daily_budget: parseInt(row.budget_daily) || 1000,
          status: 'PAUSED',
        });

        // 3. Create ad creative
        const creative = await this.fbClient.createAdCreative(accountId, this.accessToken, {
          title: row.headline,
          body: row.body_text,
          object_story_spec: {
            link_data: {
              link: row.link,
              message: row.body_text,
              name: row.headline,
              picture: row.image_url,
              call_to_action: { type: row.cta },
            },
          },
        });

        // 4. Create ad
        const ad = await this.fbClient.createAd(accountId, this.accessToken, {
          name: row.ad_name,
          adset_id: adset.id,
          creative: { creative_id: creative.id },
          status: 'PAUSED',
        });

        results.push({ row: i + 1, adName: row.ad_name, status: 'success', adId: ad.id });
        successCount++;
      } catch (err: any) {
        results.push({
          row: i + 1,
          adName: row.ad_name,
          status: 'failed',
          error: err.message || '未知错误',
        });
        failedCount++;
      }

      // Update progress
      const progress = Math.round(((i + 1) / rows.length) * 100);
      updateBatchProgress(jobId, {
        successCount,
        failedCount,
        progress,
        results,
      });

      // Rate limiting: wait 500ms between requests
      if (i < rows.length - 1) {
        await this.sleep(500);
      }
    }

    // Mark as completed
    updateBatchProgress(jobId, {
      status: 'completed',
      progress: 100,
      results,
    });
  }

  private parseTargeting(row: CsvRow): Record<string, any> {
    const targeting: Record<string, any> = {
      age_min: parseInt(row.targeting_age_min) || 18,
      age_max: parseInt(row.targeting_age_max) || 65,
      geo_locations: { countries: ['US'] }, // Default US, can be expanded
    };

    // Gender
    if (row.targeting_gender && row.targeting_gender !== 'all') {
      targeting.genders = [row.targeting_gender === 'male' ? 1 : 2];
    }

    // Interests (comma-separated)
    if (row.targeting_interests) {
      targeting.interests = row.targeting_interests.split(',').map(s => ({
        id: s.trim(),
        name: s.trim(),
      }));
    }

    return targeting;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
