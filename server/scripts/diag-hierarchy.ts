import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase } from '../src/models/database';
import { HierarchyService } from '../src/services/hierarchyService';
import { todayDateRange } from '../src/utils/todayRange';

async function main() {
  await initDatabase();
  const accountId = process.argv[2] || '1477243063804898';
  const campaignId = process.argv[3] || '120244012023150600';
  const { dateStart, dateEnd } = todayDateRange();

  const svc = new HierarchyService();
  const result = await svc.getHierarchyFromDb(accountId, dateStart, dateEnd);
  const campaign = result.campaigns.find((c) => c.id === campaignId);
  const adsets = result.adsets.filter((a) => a.campaignId === campaignId);
  const ads = result.ads.filter((a) => a.campaignId === campaignId);

  console.log({
    campaign: campaign?.name,
    spend: campaign?.spend,
    adsets: adsets.length,
    ads: ads.length,
    adsetSample: adsets.slice(0, 2).map((a) => ({ id: a.id, name: a.name, spend: a.spend })),
  });
  process.exit(0);
}

main();
